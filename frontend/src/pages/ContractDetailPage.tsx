import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "../context/OrgContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError, toErrorMessage } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { AuditTrail } from "../components/AuditTrail";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailSkeleton } from "../components/Skeleton";
import { LineItemsEditor } from "../components/LineItemsEditor";
import { AttachmentSection } from "../components/AttachmentSection";
import { inputBaseClass } from "../lib/inputStyles";
import { STATUS_ACTIONS } from "../lib/statusActions";
import type { ContractFieldData, FieldErrors } from "../types/contract";

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedOrgId } = useOrg();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ContractFieldData | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const contractQuery = useQuery({
    queryKey: ["contract", id],
    queryFn: () => api.getContract(selectedOrgId!, id!),
    enabled: !!selectedOrgId && !!id,
  });

  const eventsQuery = useQuery({
    queryKey: ["contractEvents", id],
    queryFn: () => api.getContractEvents(selectedOrgId!, id!),
    enabled: !!selectedOrgId && !!id,
  });

  const contract = contractQuery.data;

  useEffect(() => {
    if (contract && !editing) {
      setDraft(contract.fieldData);
    }
  }, [contract, editing]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateContract(selectedOrgId!, id!, draft),
    onSuccess: () => {
      setEditing(false);
      setFieldErrors(null);
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      queryClient.invalidateQueries({ queryKey: ["contractEvents", id] });
      showToast("Contract saved");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else {
        showToast(toErrorMessage(err, "Failed to save contract"));
      }
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => api.finalizeContract(selectedOrgId!, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      queryClient.invalidateQueries({ queryKey: ["contractEvents", id] });
      showToast("Contract finalized");
    },
    onError: (err) => showToast(toErrorMessage(err, "Failed to finalize")),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.archiveContract(selectedOrgId!, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      queryClient.invalidateQueries({ queryKey: ["contractEvents", id] });
      showToast("Contract archived");
    },
    onError: (err) => showToast(toErrorMessage(err, "Failed to archive")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteContract(selectedOrgId!, id!),
    onSuccess: () => {
      showToast("Draft deleted");
      navigate("/");
    },
    onError: (err) => showToast(toErrorMessage(err, "Failed to delete")),
    onSettled: () => setConfirmDeleteOpen(false),
  });

  if (contractQuery.isLoading) return <DetailSkeleton />;
  if (contractQuery.isError || !contract) {
    return <p className="p-6 text-sm text-red-600 dark:text-red-400">Contract not found.</p>;
  }

  const actions = STATUS_ACTIONS[contract.status];

  const updateDraftField = <K extends keyof ContractFieldData>(key: K, value: ContractFieldData[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const handleNextStatus = () => {
    if (contract.status === "DRAFT") finalizeMutation.mutate();
    else if (contract.status === "FINALIZED") archiveMutation.mutate();
  };
  const nextStatusPending = finalizeMutation.isPending || archiveMutation.isPending;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">
          {contract.clientName}
        </h1>
        <StatusBadge status={contract.status} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {actions.canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Edit
          </button>
        )}
        {actions.nextStatus && (
          <button
            onClick={handleNextStatus}
            disabled={nextStatusPending}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors disabled:opacity-40 ${
              contract.status === "DRAFT" ? "bg-indigo-500 hover:bg-indigo-600" : "bg-gray-700 hover:bg-gray-800"
            }`}
          >
            {actions.nextLabel}
          </button>
        )}
        {actions.canDelete && (
          <button
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleteMutation.isPending}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            Delete draft
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this draft contract?"
        description="This can't be undone. The contract and its data will be permanently removed."
        confirmLabel="Delete"
        danger
        pending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      {draft && (
        <div className="mb-8 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <Field
            label="Client name"
            value={draft.client_name}
            editing={editing}
            error={fieldErrors?.client_name}
            onChange={(v) => updateDraftField("client_name", v)}
          />
          <Field
            label="PO ref no."
            value={draft.po_ref_no}
            editing={editing}
            error={fieldErrors?.po_ref_no}
            onChange={(v) => updateDraftField("po_ref_no", v)}
          />
          <Field
            label="PO date"
            value={draft.po_date}
            editing={editing}
            error={fieldErrors?.po_date}
            onChange={(v) => updateDraftField("po_date", v)}
          />
          <Field
            label="Payment terms"
            value={draft.payment_terms ?? ""}
            editing={editing}
            error={fieldErrors?.payment_terms}
            onChange={(v) => updateDraftField("payment_terms", v)}
          />
          <Field
            label="Delivery terms"
            value={draft.delivery_terms ?? ""}
            editing={editing}
            error={fieldErrors?.delivery_terms}
            onChange={(v) => updateDraftField("delivery_terms", v)}
          />

          <LineItemsEditor
            items={draft.items}
            editing={editing}
            fieldErrors={fieldErrors}
            onChange={(items) => setDraft((prev) => (prev ? { ...prev, items } : prev))}
          />

          {editing && (
            <div className="flex gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-600 disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setFieldErrors(null);
                  setDraft(contract.fieldData);
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <AttachmentSection orgId={selectedOrgId!} contract={contract} />

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Audit trail</h2>
        {eventsQuery.isLoading ? (
          <div className="space-y-2">
            <div className="skeleton h-16 rounded-md" />
            <div className="skeleton h-16 rounded-md" />
          </div>
        ) : (
          <AuditTrail events={eventsQuery.data?.events ?? []} />
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  editing,
  error,
  onChange,
}: {
  label: string;
  value: string;
  editing: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <input
        disabled={!editing}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 block w-full ${inputBaseClass} px-3 py-1.5 disabled:border-transparent disabled:bg-transparent disabled:px-0 dark:disabled:bg-transparent`}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </label>
  );
}
