import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { createOrg, validContractPayload } from "./helpers.js";

const app = createApp();

describe("org scoping", () => {
  it("rejects requests with no X-Org-Id header", async () => {
    const res = await request(app).get("/api/contracts");
    expect(res.status).toBe(400);
  });

  it("rejects requests with an unknown org id", async () => {
    const res = await request(app)
      .get("/api/contracts")
      .set("X-Org-Id", "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(400);
  });

  it("404s when accessing another org's contract (not 403, to avoid leaking existence)", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");

    const created = await request(app)
      .post("/api/contracts")
      .set("X-Org-Id", orgA.id)
      .send(validContractPayload());
    expect(created.status).toBe(201);

    const crossOrgGet = await request(app)
      .get(`/api/contracts/${created.body.id}`)
      .set("X-Org-Id", orgB.id);
    expect(crossOrgGet.status).toBe(404);

    const sameOrgGet = await request(app)
      .get(`/api/contracts/${created.body.id}`)
      .set("X-Org-Id", orgA.id);
    expect(sameOrgGet.status).toBe(200);
  });

  it("does not leak another org's contracts in list results", async () => {
    const orgA = await createOrg("Org A");
    const orgB = await createOrg("Org B");

    await request(app).post("/api/contracts").set("X-Org-Id", orgA.id).send(validContractPayload());
    await request(app).post("/api/contracts").set("X-Org-Id", orgB.id).send(validContractPayload());

    const listA = await request(app).get("/api/contracts").set("X-Org-Id", orgA.id);
    expect(listA.body.total).toBe(1);
  });
});

describe("contract JSON validation", () => {
  it("returns per-field errors for an invalid payload, not a generic 400", async () => {
    const org = await createOrg("Org A");

    const res = await request(app)
      .post("/api/contracts")
      .set("X-Org-Id", org.id)
      .send({
        po_ref_no: "PO-1",
        po_date: "not-a-date",
        items: [{ description: "", quantity: -1, unit_price: -5 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toMatchObject({
      client_name: expect.any(String),
      po_date: expect.any(String),
      "items[0].description": expect.any(String),
      "items[0].quantity": expect.any(String),
      "items[0].unit_price": expect.any(String),
    });
  });

  it("accepts a valid payload and defaults status to DRAFT", async () => {
    const org = await createOrg("Org A");
    const res = await request(app)
      .post("/api/contracts")
      .set("X-Org-Id", org.id)
      .send(validContractPayload());

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
  });
});

describe("status workflow", () => {
  async function createDraft(orgId: string) {
    const res = await request(app)
      .post("/api/contracts")
      .set("X-Org-Id", orgId)
      .send(validContractPayload());
    return res.body;
  }

  it("enforces DRAFT -> FINALIZED -> ARCHIVED with 409 on invalid transitions", async () => {
    const org = await createOrg("Org A");
    const contract = await createDraft(org.id);

    // Can't archive a DRAFT contract directly.
    const badArchive = await request(app)
      .post(`/api/contracts/${contract.id}/archive`)
      .set("X-Org-Id", org.id);
    expect(badArchive.status).toBe(409);

    const finalize = await request(app)
      .post(`/api/contracts/${contract.id}/finalize`)
      .set("X-Org-Id", org.id);
    expect(finalize.status).toBe(200);
    expect(finalize.body.status).toBe("FINALIZED");

    // Can't finalize again.
    const doubleFinalize = await request(app)
      .post(`/api/contracts/${contract.id}/finalize`)
      .set("X-Org-Id", org.id);
    expect(doubleFinalize.status).toBe(409);

    const archive = await request(app)
      .post(`/api/contracts/${contract.id}/archive`)
      .set("X-Org-Id", org.id);
    expect(archive.status).toBe(200);
    expect(archive.body.status).toBe("ARCHIVED");

    // No transitions out of ARCHIVED.
    const badArchiveAgain = await request(app)
      .post(`/api/contracts/${contract.id}/archive`)
      .set("X-Org-Id", org.id);
    expect(badArchiveAgain.status).toBe(409);
  });

  it("rejects updates and deletes once a contract leaves DRAFT", async () => {
    const org = await createOrg("Org A");
    const contract = await createDraft(org.id);
    await request(app).post(`/api/contracts/${contract.id}/finalize`).set("X-Org-Id", org.id);

    const update = await request(app)
      .put(`/api/contracts/${contract.id}`)
      .set("X-Org-Id", org.id)
      .send(validContractPayload({ client_name: "Changed" }));
    expect(update.status).toBe(409);

    const del = await request(app).delete(`/api/contracts/${contract.id}`).set("X-Org-Id", org.id);
    expect(del.status).toBe(409);
  });

  it("allows updating a DRAFT contract and records a diff in the audit trail", async () => {
    const org = await createOrg("Org A");
    const contract = await createDraft(org.id);

    const update = await request(app)
      .put(`/api/contracts/${contract.id}`)
      .set("X-Org-Id", org.id)
      .send(validContractPayload({ client_name: "Renamed Client" }));
    expect(update.status).toBe(200);
    expect(update.body.clientName).toBe("Renamed Client");

    const events = await request(app)
      .get(`/api/contracts/${contract.id}/events`)
      .set("X-Org-Id", org.id);
    const updateEvent = events.body.events.find((e: { eventType: string }) => e.eventType === "UPDATED");
    expect(updateEvent.payload.client_name).toMatchObject({ from: "Test Client", to: "Renamed Client" });
  });

  it("records CREATED then STATUS_CHANGED events in chronological order", async () => {
    const org = await createOrg("Org A");
    const contract = await createDraft(org.id);
    await request(app).post(`/api/contracts/${contract.id}/finalize`).set("X-Org-Id", org.id);

    const events = await request(app)
      .get(`/api/contracts/${contract.id}/events`)
      .set("X-Org-Id", org.id);

    expect(events.body.events.map((e: { eventType: string }) => e.eventType)).toEqual([
      "CREATED",
      "STATUS_CHANGED",
    ]);
  });

  it("deletes a DRAFT contract and keeps its DELETED audit event with a null contract_id", async () => {
    const org = await createOrg("Org A");
    const contract = await createDraft(org.id);

    const del = await request(app).delete(`/api/contracts/${contract.id}`).set("X-Org-Id", org.id);
    expect(del.status).toBe(204);

    const getAfterDelete = await request(app)
      .get(`/api/contracts/${contract.id}`)
      .set("X-Org-Id", org.id);
    expect(getAfterDelete.status).toBe(404);
  });
});

describe("search, filter, pagination", () => {
  it("filters by status and partial case-insensitive client name", async () => {
    const org = await createOrg("Org A");
    await request(app)
      .post("/api/contracts")
      .set("X-Org-Id", org.id)
      .send(validContractPayload({ client_name: "Northwind Traders" }));
    const draft2 = await request(app)
      .post("/api/contracts")
      .set("X-Org-Id", org.id)
      .send(validContractPayload({ client_name: "Contoso" }));
    await request(app).post(`/api/contracts/${draft2.body.id}/finalize`).set("X-Org-Id", org.id);

    const byName = await request(app)
      .get("/api/contracts?client_name=north")
      .set("X-Org-Id", org.id);
    expect(byName.body.total).toBe(1);

    const byStatus = await request(app)
      .get("/api/contracts?status=FINALIZED")
      .set("X-Org-Id", org.id);
    expect(byStatus.body.total).toBe(1);
    expect(byStatus.body.contracts[0].clientName).toBe("Contoso");
  });

  it("paginates results", async () => {
    const org = await createOrg("Org A");
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post("/api/contracts")
        .set("X-Org-Id", org.id)
        .send(validContractPayload({ po_ref_no: `PO-${i}` }));
    }

    const page1 = await request(app)
      .get("/api/contracts?page=1&limit=2")
      .set("X-Org-Id", org.id);
    expect(page1.body.contracts).toHaveLength(2);
    expect(page1.body.total).toBe(3);

    const page2 = await request(app)
      .get("/api/contracts?page=2&limit=2")
      .set("X-Org-Id", org.id);
    expect(page2.body.contracts).toHaveLength(1);
  });
});
