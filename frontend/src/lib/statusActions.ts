import type { ContractStatus } from "../types/contract";

/**
 * What's available for a contract at each status, in one place — mirrors the backend's
 * ALLOWED_TRANSITIONS table (contractService.ts) so adding/changing a status only means
 * updating this one config instead of hunting down separate conditionals per action.
 * This is still just UI convenience: the backend enforces the real transition rules
 * regardless of what buttons this renders.
 */
export const STATUS_ACTIONS: Record<
  ContractStatus,
  { canEdit: boolean; canDelete: boolean; nextStatus: ContractStatus | null; nextLabel: string | null }
> = {
  DRAFT: { canEdit: true, canDelete: true, nextStatus: "FINALIZED", nextLabel: "Finalize" },
  FINALIZED: { canEdit: false, canDelete: false, nextStatus: "ARCHIVED", nextLabel: "Archive" },
  ARCHIVED: { canEdit: false, canDelete: false, nextStatus: null, nextLabel: null },
};
