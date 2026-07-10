import { PrismaClient, ContractStatus } from "@prisma/client";

const prisma = new PrismaClient();

type SeedItem = {
  description: string;
  quantity: number;
  quantity_unit?: string;
  unit_price: number;
  pricing_unit?: string;
  total?: number;
};

type SeedContract = {
  clientName: string;
  poRefNo: string;
  poDate: string;
  paymentTerms?: string;
  deliveryTerms?: string;
  items: SeedItem[];
  finalStatus: ContractStatus;
};

async function seedOrg(name: string, contracts: SeedContract[]) {
  const org = await prisma.organisation.create({ data: { name } });

  for (const c of contracts) {
    const fieldData = {
      client_name: c.clientName,
      po_ref_no: c.poRefNo,
      po_date: c.poDate,
      payment_terms: c.paymentTerms,
      delivery_terms: c.deliveryTerms,
      items: c.items,
    };

    const contract = await prisma.contract.create({
      data: {
        orgId: org.id,
        clientName: c.clientName,
        poRefNo: c.poRefNo,
        poDate: new Date(`${c.poDate}T00:00:00.000Z`),
        fieldData,
        status: ContractStatus.DRAFT,
      },
    });

    await prisma.contractEvent.create({
      data: {
        contractId: contract.id,
        orgId: org.id,
        eventType: "CREATED",
        payload: fieldData,
      },
    });

    if (c.finalStatus === ContractStatus.FINALIZED || c.finalStatus === ContractStatus.ARCHIVED) {
      await prisma.contract.update({ where: { id: contract.id }, data: { status: ContractStatus.FINALIZED } });
      await prisma.contractEvent.create({
        data: {
          contractId: contract.id,
          orgId: org.id,
          eventType: "STATUS_CHANGED",
          fromStatus: ContractStatus.DRAFT,
          toStatus: ContractStatus.FINALIZED,
        },
      });
    }

    if (c.finalStatus === ContractStatus.ARCHIVED) {
      await prisma.contract.update({ where: { id: contract.id }, data: { status: ContractStatus.ARCHIVED } });
      await prisma.contractEvent.create({
        data: {
          contractId: contract.id,
          orgId: org.id,
          eventType: "STATUS_CHANGED",
          fromStatus: ContractStatus.FINALIZED,
          toStatus: ContractStatus.ARCHIVED,
        },
      });
    }
  }

  return org;
}

async function main() {
  // Clean slate for repeatable seeding.
  await prisma.contractEvent.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.organisation.deleteMany();

  await seedOrg("Acme Manufacturing", [
    {
      clientName: "Northwind Traders",
      poRefNo: "PO-1001",
      poDate: "2026-05-01",
      paymentTerms: "Net 30",
      deliveryTerms: "FOB Origin",
      items: [
        { description: "Steel brackets", quantity: 500, quantity_unit: "units", unit_price: 2.5 },
        { description: "Rubber gaskets", quantity: 1000, quantity_unit: "units", unit_price: 0.75 },
      ],
      finalStatus: ContractStatus.DRAFT,
    },
    {
      clientName: "Contoso Ltd",
      poRefNo: "PO-1002",
      poDate: "2026-04-15",
      paymentTerms: "Net 45",
      items: [{ description: "Aluminum sheets", quantity: 200, quantity_unit: "sheets", unit_price: 18 }],
      finalStatus: ContractStatus.FINALIZED,
    },
    {
      clientName: "Northwind Traders",
      poRefNo: "PO-0998",
      poDate: "2026-02-10",
      deliveryTerms: "CIF Destination",
      items: [
        { description: "Copper wiring", quantity: 300, quantity_unit: "meters", unit_price: 4.2 },
        { description: "Circuit breakers", quantity: 50, quantity_unit: "units", unit_price: 22 },
      ],
      finalStatus: ContractStatus.ARCHIVED,
    },
  ]);

  await seedOrg("Globex Trading Co", [
    {
      clientName: "Initech Holdings",
      poRefNo: "PO-2001",
      poDate: "2026-06-20",
      paymentTerms: "Net 15",
      items: [{ description: "Office furniture set", quantity: 25, quantity_unit: "sets", unit_price: 340 }],
      finalStatus: ContractStatus.DRAFT,
    },
    {
      clientName: "Umbrella Logistics",
      poRefNo: "PO-2002",
      poDate: "2026-03-05",
      paymentTerms: "Net 30",
      deliveryTerms: "DDP",
      items: [
        { description: "Warehouse pallets", quantity: 150, quantity_unit: "units", unit_price: 12.5 },
        { description: "Shrink wrap rolls", quantity: 80, quantity_unit: "rolls", unit_price: 9.99 },
      ],
      finalStatus: ContractStatus.FINALIZED,
    },
  ]);

  console.log("Seed complete: 2 organisations, 5 contracts.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
