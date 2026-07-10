import { Prisma, ContractStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/AppError.js";
import type { ContractInput } from "../validation/contractSchema.js";
import { broadcastStatusChanged } from "../sse/sseManager.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus | null> = {
  DRAFT: ContractStatus.FINALIZED,
  FINALIZED: ContractStatus.ARCHIVED,
  ARCHIVED: null,
};

function computeDiff(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = new Set([...Object.keys(oldData ?? {}), ...Object.keys(newData ?? {})]);
  for (const key of keys) {
    const oldVal = oldData?.[key];
    const newVal = newData?.[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      diff[key] = { from: oldVal ?? null, to: newVal ?? null };
    }
  }
  return diff;
}

export async function createContract(orgId: string, input: ContractInput) {
  return prisma.$transaction(async (tx) => {
    const contract = await tx.contract.create({
      data: {
        orgId,
        clientName: input.client_name,
        poRefNo: input.po_ref_no,
        poDate: new Date(`${input.po_date}T00:00:00.000Z`),
        fieldData: input,
        status: ContractStatus.DRAFT,
      },
    });
    await tx.contractEvent.create({
      data: {
        contractId: contract.id,
        orgId,
        eventType: "CREATED",
        payload: input,
      },
    });
    return contract;
  });
}

export type ListFilters = {
  status?: string;
  clientName?: string;
  contractId?: string;
  page: number;
  limit: number;
};

export async function listContracts(orgId: string, filters: ListFilters) {
  const where: Prisma.ContractWhereInput = { orgId };

  if (filters.status) {
    if (!(filters.status in ContractStatus)) {
      throw new AppError(400, `Invalid status filter: ${filters.status}`);
    }
    where.status = filters.status as ContractStatus;
  }

  if (filters.clientName) {
    where.clientName = { contains: filters.clientName, mode: "insensitive" };
  }

  if (filters.contractId) {
    if (!UUID_PATTERN.test(filters.contractId)) {
      // Not a valid UUID -> can never match a real row, short-circuit to empty result.
      return { contracts: [], total: 0, page: filters.page, limit: filters.limit };
    }
    where.id = filters.contractId;
  }

  const [total, contracts] = await Promise.all([
    prisma.contract.count({ where }),
    prisma.contract.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
  ]);

  return { contracts, total, page: filters.page, limit: filters.limit };
}

export async function getContract(orgId: string, id: string) {
  const contract = await prisma.contract.findFirst({ where: { id, orgId } });
  if (!contract) {
    throw new AppError(404, "Contract not found");
  }
  return contract;
}

export async function updateContract(orgId: string, id: string, input: ContractInput) {
  const existing = await prisma.contract.findFirst({ where: { id, orgId } });
  if (!existing) {
    throw new AppError(404, "Contract not found");
  }
  if (existing.status !== ContractStatus.DRAFT) {
    throw new AppError(409, "Only DRAFT contracts can be updated");
  }

  const diff = computeDiff(existing.fieldData as Record<string, unknown>, input);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.contract.update({
      where: { id },
      data: {
        clientName: input.client_name,
        poRefNo: input.po_ref_no,
        poDate: new Date(`${input.po_date}T00:00:00.000Z`),
        fieldData: input,
      },
    });
    await tx.contractEvent.create({
      data: {
        contractId: id,
        orgId,
        eventType: "UPDATED",
        payload: diff as Prisma.InputJsonValue,
      },
    });
    return updated;
  });
}

async function transitionStatus(orgId: string, id: string, expectedCurrent: ContractStatus) {
  const existing = await prisma.contract.findFirst({ where: { id, orgId } });
  if (!existing) {
    throw new AppError(404, "Contract not found");
  }
  if (existing.status !== expectedCurrent) {
    throw new AppError(
      409,
      `Cannot transition from ${existing.status}; contract must be ${expectedCurrent}`,
    );
  }

  const nextStatus = ALLOWED_TRANSITIONS[expectedCurrent];
  if (!nextStatus) {
    throw new AppError(409, `No valid transition from ${expectedCurrent}`);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.contract.update({ where: { id }, data: { status: nextStatus } });
    await tx.contractEvent.create({
      data: {
        contractId: id,
        orgId,
        eventType: "STATUS_CHANGED",
        fromStatus: expectedCurrent,
        toStatus: nextStatus,
      },
    });
    return u;
  });

  broadcastStatusChanged(orgId, {
    contract_id: id,
    from_status: expectedCurrent,
    to_status: nextStatus,
  });

  return updated;
}

export function finalizeContract(orgId: string, id: string) {
  return transitionStatus(orgId, id, ContractStatus.DRAFT);
}

export function archiveContract(orgId: string, id: string) {
  return transitionStatus(orgId, id, ContractStatus.FINALIZED);
}

export async function deleteContract(orgId: string, id: string) {
  const existing = await prisma.contract.findFirst({ where: { id, orgId } });
  if (!existing) {
    throw new AppError(404, "Contract not found");
  }
  if (existing.status !== ContractStatus.DRAFT) {
    throw new AppError(409, "Only DRAFT contracts can be deleted");
  }

  await prisma.$transaction(async (tx) => {
    await tx.contractEvent.create({
      data: {
        contractId: id,
        orgId,
        eventType: "DELETED",
        payload: existing.fieldData as Prisma.InputJsonValue,
      },
    });
    await tx.contract.delete({ where: { id } });
  });
}

export async function getContractEvents(orgId: string, id: string) {
  const contract = await prisma.contract.findFirst({ where: { id, orgId } });
  if (!contract) {
    throw new AppError(404, "Contract not found");
  }
  return prisma.contractEvent.findMany({
    where: { contractId: id },
    orderBy: { createdAt: "asc" },
  });
}
