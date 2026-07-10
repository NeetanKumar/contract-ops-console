import { prisma } from "../src/lib/prisma.js";

export function validContractPayload(overrides: Record<string, unknown> = {}) {
  return {
    client_name: "Test Client",
    po_ref_no: "PO-TEST-1",
    po_date: "2026-01-15",
    payment_terms: "Net 30",
    items: [{ description: "Widget", quantity: 2, unit_price: 10 }],
    ...overrides,
  };
}

export async function createOrg(name: string) {
  return prisma.organisation.create({ data: { name } });
}
