import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrg } from "./helpers.js";
import { prisma } from "../src/lib/prisma.js";
import type { DealExtraction } from "../src/services/dealExtractionService.js";

// WHATSAPP_DEBOUNCE_MS is set to 50ms in .env.test so this only needs to clear a short
// debounce window, not the production 15s one.
const FLUSH_WAIT_MS = 300;
function waitForFlush() {
  return new Promise((resolve) => setTimeout(resolve, FLUSH_WAIT_MS));
}

vi.mock("../src/services/dealExtractionService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/dealExtractionService.js")>();
  return { ...actual, extractDealTerms: vi.fn() };
});

const { extractDealTerms } = await import("../src/services/dealExtractionService.js");
const { handleIncomingMessage, handleMessageEcho, createConnection } = await import(
  "../src/whatsapp/whatsappCloudApi.js"
);

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

let counter = 0;
function nextId(prefix: string) {
  counter += 1;
  return `${prefix}-${counter}`;
}

beforeEach(() => {
  mockedExtract.mockReset();
});

describe("coexistence connection routing", () => {
  it("drops a message for a phone_number_id that matches neither the test number nor any connection", async () => {
    await expect(
      handleIncomingMessage({
        id: nextId("msg"),
        from: "+19999999999",
        timestamp: Math.floor(Date.now() / 1000),
        body: "hello",
        senderName: "Nobody",
        phoneNumberId: "totally-unrecognized-id",
      }),
    ).resolves.not.toThrow();
    await waitForFlush();
    expect(mockedExtract).not.toHaveBeenCalled();
  });

  it("auto-creates a negotiation from a counterparty's first message, with no prior registration", async () => {
    const org = await createOrg("Org A");
    await createConnection({
      orgId: org.id,
      wabaId: "waba-1",
      phoneNumberId: "our-connected-phone-id",
      displayPhoneNumber: "15550001111",
      accessToken: "token-1",
    });

    mockedExtract.mockResolvedValueOnce(extraction({ deal_status: "negotiating" }));

    await handleIncomingMessage({
      id: nextId("msg"),
      from: "916000000001",
      timestamp: Math.floor(Date.now() / 1000),
      body: "I want to buy 500 MT wheat",
      senderName: "Counterparty",
      phoneNumberId: "our-connected-phone-id",
    });
    await waitForFlush();

    const negotiations = await prisma.whatsAppNegotiation.findMany({ where: { orgId: org.id } });
    expect(negotiations).toHaveLength(1);
    expect(negotiations[0].counterpartyPhone).toBe("916000000001");
    expect(negotiations[0].ourPhone).toBe("15550001111");
    expect(negotiations[0].status).toBe("OPEN");
  });

  it("pairs an incoming message and an echoed outgoing reply into the same negotiation via the shared counterparty number", async () => {
    const org = await createOrg("Org A");
    await createConnection({
      orgId: org.id,
      wabaId: "waba-2",
      phoneNumberId: "our-connected-phone-id-2",
      displayPhoneNumber: "15550002222",
      accessToken: "token-2",
    });

    mockedExtract.mockResolvedValueOnce(extraction({ deal_status: "negotiating" }));
    await handleIncomingMessage({
      id: nextId("msg"),
      from: "916000000002",
      timestamp: Math.floor(Date.now() / 1000),
      body: "Offering 500 MT wheat at 42000",
      senderName: "Counterparty",
      phoneNumberId: "our-connected-phone-id-2",
    });
    await waitForFlush();

    mockedExtract.mockResolvedValueOnce(extraction({ deal_status: "agreed" }));
    await handleMessageEcho(
      {
        id: nextId("echo"),
        from: "15550002222",
        to: "916000000002",
        timestamp: Math.floor(Date.now() / 1000),
        body: "Deal, agreed at 42000",
      },
      "our-connected-phone-id-2",
    );
    await waitForFlush();

    const negotiations = await prisma.whatsAppNegotiation.findMany({ where: { orgId: org.id } });
    expect(negotiations).toHaveLength(1); // not two separate threads
    expect(negotiations[0].status).toBe("AGREED");
    const lines = negotiations[0].lines as string[];
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.includes("Offering 500 MT wheat"))).toBe(true);
    expect(lines.some((l) => l.includes("Deal, agreed"))).toBe(true);
  });

  it("keeps two different counterparties for the same connected number as separate negotiations", async () => {
    const org = await createOrg("Org A");
    await createConnection({
      orgId: org.id,
      wabaId: "waba-3",
      phoneNumberId: "our-connected-phone-id-3",
      displayPhoneNumber: "15550003333",
      accessToken: "token-3",
    });

    mockedExtract.mockResolvedValue(extraction({ deal_status: "negotiating" }));

    await handleIncomingMessage({
      id: nextId("msg"),
      from: "916000000003",
      timestamp: Math.floor(Date.now() / 1000),
      body: "Deal A: buying wheat",
      senderName: "Counterparty A",
      phoneNumberId: "our-connected-phone-id-3",
    });
    await handleIncomingMessage({
      id: nextId("msg"),
      from: "916000000004",
      timestamp: Math.floor(Date.now() / 1000),
      body: "Deal B: selling soybean",
      senderName: "Counterparty B",
      phoneNumberId: "our-connected-phone-id-3",
    });
    await waitForFlush();

    const negotiations = await prisma.whatsAppNegotiation.findMany({
      where: { orgId: org.id },
      orderBy: { counterpartyPhone: "asc" },
    });
    expect(negotiations).toHaveLength(2);
    expect(negotiations.map((n) => n.counterpartyPhone)).toEqual(["916000000003", "916000000004"]);
  });

  it("fills in direction from extraction once inferred, having started UNKNOWN", async () => {
    const org = await createOrg("Org A");
    await createConnection({
      orgId: org.id,
      wabaId: "waba-4",
      phoneNumberId: "our-connected-phone-id-4",
      displayPhoneNumber: "15550004444",
      accessToken: "token-4",
    });

    mockedExtract.mockResolvedValueOnce(extraction({ deal_status: "negotiating", direction: "WE_BUY" }));
    await handleIncomingMessage({
      id: nextId("msg"),
      from: "916000000005",
      timestamp: Math.floor(Date.now() / 1000),
      body: "Selling wheat, want to buy?",
      senderName: "Counterparty",
      phoneNumberId: "our-connected-phone-id-4",
    });
    await waitForFlush();

    const negotiation = await prisma.whatsAppNegotiation.findFirstOrThrow({ where: { orgId: org.id } });
    expect(negotiation.direction).toBe("WE_BUY");
  });

  it("rejects an echo for a phone_number_id that isn't a known coexistence connection", async () => {
    await expect(
      handleMessageEcho(
        {
          id: nextId("echo"),
          from: "15550000000",
          to: "916000000006",
          timestamp: Math.floor(Date.now() / 1000),
          body: "hello",
        },
        "test-shared-phone-number-id",
      ),
    ).resolves.not.toThrow();
    await waitForFlush();
    expect(mockedExtract).not.toHaveBeenCalled();
  });
});
