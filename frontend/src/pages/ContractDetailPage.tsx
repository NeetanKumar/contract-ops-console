import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "../context/OrgContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { AuditTrail } from "../components/AuditTrail";
import { PaperclipIcon } from "../components/PaperclipIcon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DetailSkeleton } from "../components/Skeleton";
import type { ContractFieldData, FieldErrors, LineItem } from "../types/contract";

function emptyItem(): LineItem {
  return { description: "", quantity: 1, unit_price: 0 };
}

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
        showToast(err instanceof ApiError ? err.message : "Failed to save contract");
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
    onError: (err) => showToast(err instanceof ApiError ? err.message : "Failed to finalize"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.archiveContract(selectedOrgId!, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      queryClient.invalidateQueries({ queryKey: ["contractEvents", id] });
      showToast("Contract archived");
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : "Failed to archive"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteContract(selectedOrgId!, id!),
    onSuccess: () => {
      showToast("Draft deleted");
      navigate("/");
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : "Failed to delete"),
    onSettled: () => setConfirmDeleteOpen(false),
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file: File) => api.uploadAttachment(selectedOrgId!, id!, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      showToast("Attachment uploaded");
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : "Failed to upload attachment"),
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: () => api.deleteAttachment(selectedOrgId!, id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract", id] });
      showToast("Attachment removed");
    },
    onError: (err) => showToast(err instanceof ApiError ? err.message : "Failed to remove attachment"),
  });

  if (contractQuery.isLoading) return <DetailSkeleton />;
  if (contractQuery.isError || !contract) {
    return <p className="p-6 text-sm text-red-600 dark:text-red-400">Contract not found.</p>;
  }

  const updateDraftField = <K extends keyof ContractFieldData>(key: K, value: ContractFieldData[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item));
      return { ...prev, items };
    });
  };

  const removeItem = (index: number) => {
    setDraft((prev) => (prev ? { ...prev, items: prev.items.filter((_, i) => i !== index) } : prev));
  };

  const addItem = () => {
    setDraft((prev) => (prev ? { ...prev, items: [...prev.items, emptyItem()] } : prev));
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          {contract.clientName}
        </h1>
        <StatusBadge status={contract.status} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {contract.status === "DRAFT" && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Edit
          </button>
        )}
        {contract.status === "DRAFT" && (
          <button
            onClick={() => finalizeMutation.mutate()}
            disabled={finalizeMutation.isPending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-40"
          >
            Finalize
          </button>
        )}
        {contract.status === "FINALIZED" && (
          <button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            className="rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-gray-800 disabled:opacity-40"
          >
            Archive
          </button>
        )}
        {contract.status === "DRAFT" && (
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
        <div className="mb-8 space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
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

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Items</p>
            <div className="space-y-2">
              {draft.items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-2 rounded-md bg-gray-50 p-2 dark:bg-gray-800/60"
                >
                  <div className="col-span-5">
                    <input
                      disabled={!editing}
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="Description"
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm transition-colors disabled:border-transparent disabled:bg-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-transparent"
                    />
                    {fieldErrors?.[`items[${index}].description`] && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {fieldErrors[`items[${index}].description`]}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <input
                      disabled={!editing}
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                      placeholder="Qty"
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm transition-colors disabled:border-transparent disabled:bg-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-transparent"
                    />
                    {fieldErrors?.[`items[${index}].quantity`] && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {fieldErrors[`items[${index}].quantity`]}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <input
                      disabled={!editing}
                      value={item.quantity_unit ?? ""}
                      onChange={(e) => updateItem(index, { quantity_unit: e.target.value })}
                      placeholder="Unit"
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm transition-colors disabled:border-transparent disabled:bg-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-transparent"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      disabled={!editing}
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                      placeholder="Unit price"
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm transition-colors disabled:border-transparent disabled:bg-transparent dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-transparent"
                    />
                    {fieldErrors?.[`items[${index}].unit_price`] && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {fieldErrors[`items[${index}].unit_price`]}
                      </p>
                    )}
                  </div>
                  <div className="col-span-1 flex items-start justify-end">
                    {editing && (
                      <button
                        onClick={() => removeItem(index)}
                        className="text-xs text-red-600 transition-colors hover:text-red-700 dark:text-red-400"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {editing && (
              <button
                onClick={addItem}
                className="mt-2 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400"
              >
                + Add item
              </button>
            )}
          </div>

          {editing && (
            <div className="flex gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:opacity-40"
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

      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <PaperclipIcon />
          Attachment
        </h2>
        {contract.attachmentFilename ? (
          <div>
            <div className="flex items-center justify-between rounded-md border border-indigo-100 bg-indigo-50 px-3 py-2.5 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/40">
              <a
                href={api.attachmentUrl(selectedOrgId!, contract.id)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 font-medium text-indigo-700 transition-colors hover:underline dark:text-indigo-300"
              >
                <PaperclipIcon />
                {contract.attachmentFilename}
                {contract.attachmentSize != null && (
                  <span className="font-normal text-indigo-400 dark:text-indigo-500">
                    ({Math.round(contract.attachmentSize / 1024)} KB)
                  </span>
                )}
              </a>
              <div className="flex items-center gap-1">
                <label className="cursor-pointer rounded px-2 py-1 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/50">
                  {uploadAttachmentMutation.isPending ? "Uploading…" : "Replace"}
                  <input
                    type="file"
                    accept="application/pdf"
                    disabled={uploadAttachmentMutation.isPending}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadAttachmentMutation.mutate(file);
                      e.target.value = "";
                    }}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={() => deleteAttachmentMutation.mutate()}
                  disabled={deleteAttachmentMutation.isPending}
                  className="rounded px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Remove
                </button>
              </div>
            </div>
            {contract.attachmentMimeType === "application/pdf" && (
              <iframe
                key={contract.attachmentUploadedAt}
                src={`${api.attachmentUrl(selectedOrgId!, contract.id)}&t=${encodeURIComponent(
                  contract.attachmentUploadedAt ?? "",
                )}`}
                title={`Preview of ${contract.attachmentFilename}`}
                className="mt-3 h-[600px] w-full rounded-md border border-gray-200 dark:border-gray-800"
              />
            )}
          </div>
        ) : (
          <label
            className={`flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors ${
              uploadAttachmentMutation.isPending
                ? "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-800/40"
                : "border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 dark:border-gray-700 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/30"
            }`}
          >
            <input
              type="file"
              accept="application/pdf"
              disabled={uploadAttachmentMutation.isPending}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadAttachmentMutation.mutate(file);
                e.target.value = "";
              }}
              className="hidden"
            />
            <PaperclipIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {uploadAttachmentMutation.isPending ? "Uploading…" : "Click to upload a PDF"}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">Optional — PDF only, up to 10MB</span>
          </label>
        )}
      </div>

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
        className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm transition-colors disabled:border-transparent disabled:bg-transparent disabled:px-0 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-transparent"
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </label>
  );
}
