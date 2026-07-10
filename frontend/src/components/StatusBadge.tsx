import type { ContractStatus } from "../types/contract";

const STYLES: Record<ContractStatus, string> = {
  DRAFT: "bg-amber-100 text-amber-800",
  FINALIZED: "bg-blue-100 text-blue-800",
  ARCHIVED: "bg-gray-200 text-gray-700",
};

export function StatusBadge({ status }: { status: ContractStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {status}
    </span>
  );
}
