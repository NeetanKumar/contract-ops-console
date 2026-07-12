import type { ContractStatus } from "../types/contract";

const STYLES: Record<ContractStatus, string> = {
  DRAFT: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  FINALIZED: "bg-indigo-100 text-indigo-500 dark:bg-indigo-900 dark:text-indigo-300",
  ARCHIVED: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
};

const DOT_STYLES: Record<ContractStatus, string> = {
  DRAFT: "bg-amber-500",
  FINALIZED: "bg-indigo-500",
  ARCHIVED: "bg-gray-500",
};

export function StatusBadge({ status }: { status: ContractStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_STYLES[status]}`} />
      {status}
    </span>
  );
}
