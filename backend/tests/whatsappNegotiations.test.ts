import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createOrg } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import type { DealExtraction } from "../src/services/dealExtractionService.js";

// WHATSAPP_DEBOUNCE_MS is set to 50ms in .env.test (loaded by tests/setup.ts before any
// test file's imports run) so this real wait only needs to clear a short debounce window,
// not the production 15s one.
const FLUSH_WAIT_MS = 300;
function waitForFlush() {
  return new Promise((resolve) => setTimeout(resolve, FLUSH_WAIT_MS));
}

vi.mock("../src/services/dealExtractionService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/dealExtractionService.js")>();
  return { ...actual, extractDealTerms: vi.fn() };
});

const { extractDealTerms } = await import("../src/services/dealExtractionService.js");
const { handleIncomingMessage, createNegotiation } = await import("../src/whatsapp/whatsappCloudApi.js");

const app = createApp();
const mockedExtract = vi.mocked(extractDealTerms);

function extraction(overrides: Partial<DealExtraction> = {}): DealExtraction {
  return {
    deal_status: "negotiating",
    direction: "UNKNOWN",
    items: [
      {
        commodity: { value: "wheat", confidence: 0.9 },
        quantity: { value: 500, confidence: 0.9 },
        unit: { value: "MT", confidence: 0.9 },
        price: { value: 300, confidence: 0.8 },
      },
    ],
    counterparty: { value: "AgroTrade Ltd", confidence: 0.9 },
    delivery_date: { value: "2026-08-15", confidence: 0.8 },
    ...overrides,
  };
}

let messageCounter = 0;
function cloudApiMessage(overrides: Partial<Parameters<typeof handleIncomingMessage>[0]> = {}) {
  messageCounter += 1;
  return {
    id: `msg-${messageCounter}`,
    from: "+10000000001",
    timestamp: Math.floor(Date.now() / 1000),
    body: "Offering 500 MT wheat at 300",
    senderName: "Trader",
    // Matches WHATSAPP_CLOUD_API_PHONE_NUMBER_ID in .env.test, so these messages resolve
    // to the "test" (dev/test explicit-registration) connection mode, not "coexistence".
    phoneNumberId: "test-shared-phone-number-id",
    ...overrides,
  };
}

beforeEach(() => {
  mockedExtract.mockReset();
});

describe("negotiation CRUD is org-scoped", () => {
  it("rejects creating a negotiation with no X-Org-Id header", async () => {
    const res = await request(app)
      .post("/api/whatsapp/negotiations")
      .send({ ourPhone: "+1", counterpartyPhone: "+2", direction: "WE_BUY" });
    expect(res.status).toBe(400);
  });

  it("does not leak another org's negotiations in list results", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");

    await request(app)
      .post("/api/whatsapp/negotiations")
      .set("X-Org-Id", orgA.id)
      .send({ ourPhone: "+10000000001", counterpartyPhone: "+10000000002", direction: "WE_BUY" });

    const listB = await request(app).get("/api/whatsapp/negotiations").set("X-Org-Id", orgB.id);
    expect(listB.body.negotiations).toHaveLength(0);

    const listA = await request(app).get("/api/whatsapp/negotiations").set("X-Org-Id", orgA.id);
    expect(listA.body.negotiations).toHaveLength(1);
  });

  it("404s when abandoning another org's negotiation", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");

    const created = await request(app)
      .post("/api/whatsapp/negotiations")
      .set("X-Org-Id", orgA.id)
      .send({ ourPhone: "+10000000001", counterpartyPhone: "+10000000002", direction: "WE_BUY" });

    const crossOrgAbandon = await request(app)
      .post(`/api/whatsapp/negotiations/${created.body.id}/abandon`)
      .set("X-Org-Id", orgB.id);
    expect(crossOrgAbandon.status).toBe(404);

    const sameOrgAbandon = await request(app)
      .post(`/api/whatsapp/negotiations/${created.body.id}/abandon`)
      .set("X-Org-Id", orgA.id);
    expect(sameOrgAbandon.status).toBe(200);
    expect(sameOrgAbandon.body.status).toBe("ABANDONED");
  });

  it("rejects abandoning an already-abandoned negotiation", async () => {
    const org = await createOrg("Org A");
    const created = await request(app)
      .post("/api/whatsapp/negotiations")
      .set("X-Org-Id", org.id)
      .send({ ourPhone: "+10000000001", counterpartyPhone: "+10000000002", direction: "WE_BUY" });

    await request(app).post(`/api/whatsapp/negotiations/${created.body.id}/abandon`).set("X-Org-Id", org.id);
    const second = await request(app)
      .post(`/api/whatsapp/negotiations/${created.body.id}/abandon`)
      .set("X-Org-Id", org.id);
    expect(second.status).toBe(400);
  });
});

describe("deal-status classification gates draft creation", () => {
  it("does not create a draft while the negotiation is still being negotiated", async () => {
    const org = await createOrg("Org A");
    const negotiation = await createNegotiation({
      orgId: org.id,
      ourPhone: "+10000000001",
      counterpartyPhone: "+10000000002",
      direction: "WE_BUY",
    });

    mockedExtract.mockResolvedValueOnce(extraction({ deal_status: "negotiating" }));

    await handleIncomingMessage(cloudApiMessage({ from: "+10000000001" }));
    await waitForFlush();

    expect(mockedExtract).toHaveBeenCalledTimes(1);
    const reloaded = await prisma.whatsAppNegotiation.findUniqueOrThrow({ where: { id: negotiation.id } });
    expect(reloaded.status).toBe("OPEN");
    expect(reloaded.resultingContractId).toBeNull();
    expect(await prisma.contract.count({ where: { orgId: org.id } })).toBe(0);
  });

  it("creates exactly one draft contract once the thread reaches agreement, and flips the negotiation to AGREED", async () => {
    const org = await createOrg("Org A");
    const negotiation = await createNegotiation({
      orgId: org.id,
      ourPhone: "+10000000001",
      counterpartyPhone: "+10000000002",
      direction: "WE_BUY",
    });

    mockedExtract.mockResolvedValueOnce(extraction({ deal_status: "negotiating" }));
    await handleIncomingMessage(cloudApiMessage({ from: "+10000000001", body: "Offering 300/MT" }));
    await waitForFlush();

    mockedExtract.mockResolvedValueOnce(extraction({ deal_status: "agreed" }));
    await handleIncomingMessage(cloudApiMessage({ from: "+10000000002", body: "Agreed at 300/MT" }));
    await waitForFlush();

    const reloaded = await prisma.whatsAppNegotiation.findUniqueOrThrow({ where: { id: negotiation.id } });
    expect(reloaded.status).toBe("AGREED");
    expect(reloaded.resultingContractId).not.toBeNull();

    const contracts = await prisma.contract.count({ where: { orgId: org.id } });
    expect(contracts).toBe(1);

    // Both messages' context (accumulated across flushes) fed the final extraction call.
    const lines = reloaded.lines as string[];
    expect(lines.some((l) => l.includes("Buyer"))).toBe(true);
    expect(lines.some((l) => l.includes("Seller"))).toBe(true);
  });
});

describe("incoming message routing", () => {
  it("drops a message from a phone number with no open negotiation, without throwing", async () => {
    await expect(handleIncomingMessage(cloudApiMessage({ from: "+19999999999" }))).resolves.not.toThrow();
    await waitForFlush();
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("routes to the right negotiation via label when one phone number has two concurrent open deals", async () => {
    const org = await createOrg("Org A");
    const sharedPhone = "+10000000001";

    const dealA = await createNegotiation({
      orgId: org.id,
      ourPhone: sharedPhone,
      counterpartyPhone: "+10000000002",
      direction: "WE_BUY",
      label: "DealA",
    });
    const dealB = await createNegotiation({
      orgId: org.id,
      ourPhone: sharedPhone,
      counterpartyPhone: "+10000000003",
      direction: "WE_SELL",
      label: "DealB",
    });

    mockedExtract.mockResolvedValue(extraction({ deal_status: "negotiating" }));

    await handleIncomingMessage(
      cloudApiMessage({ from: sharedPhone, body: "Update on DealA: offering 300/MT" }),
    );
    await waitForFlush();

    const reloadedA = await prisma.whatsAppNegotiation.findUniqueOrThrow({ where: { id: dealA.id } });
    const reloadedB = await prisma.whatsAppNegotiation.findUniqueOrThrow({ where: { id: dealB.id } });
    expect((reloadedA.lines as string[]).length).toBe(1);
    expect((reloadedB.lines as string[]).length).toBe(0);
  });

  it("holds an ambiguous message (no label match) for manual routing instead of guessing", async () => {
    const org = await createOrg("Org A");
    const sharedPhone = "+10000000001";

    await createNegotiation({
      orgId: org.id,
      ourPhone: sharedPhone,
      counterpartyPhone: "+10000000002",
      direction: "WE_BUY",
      label: "DealA",
    });
    await createNegotiation({
      orgId: org.id,
      ourPhone: sharedPhone,
      counterpartyPhone: "+10000000003",
      direction: "WE_SELL",
      label: "DealB",
    });

    await handleIncomingMessage(cloudApiMessage({ from: sharedPhone, body: "no idea which deal this is about" }));
    await waitForFlush();

    expect(mockedExtract).not.toHaveBeenCalled();
    const unmatched = await prisma.whatsAppUnmatchedMessage.findMany({ where: { orgId: org.id } });
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].from).toBe(sharedPhone);
  });
});

describe("unmatched message assignment", () => {
  it("assigns an unmatched message to a chosen negotiation via the API, appending it to the transcript", async () => {
    const org = await createOrg("Org A");
    const negotiation = await createNegotiation({
      orgId: org.id,
      ourPhone: "+10000000001",
      counterpartyPhone: "+10000000002",
      direction: "WE_BUY",
    });
    const unmatched = await prisma.whatsAppUnmatchedMessage.create({
      data: { orgId: org.id, from: "+10000000001", body: "some ambiguous message" },
    });

    const res = await request(app)
      .post(`/api/whatsapp/unmatched-messages/${unmatched.id}/assign`)
      .set("X-Org-Id", org.id)
      .send({ negotiationId: negotiation.id });
    expect(res.status).toBe(204);

    const remaining = await prisma.whatsAppUnmatchedMessage.findMany({ where: { orgId: org.id } });
    expect(remaining).toHaveLength(0);

    const reloaded = await prisma.whatsAppNegotiation.findUniqueOrThrow({ where: { id: negotiation.id } });
    expect((reloaded.lines as string[]).some((l) => l.includes("some ambiguous message"))).toBe(true);
  });
});
