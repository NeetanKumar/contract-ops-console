import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "../context/OrgContext";
import { useToast } from "../context/ToastContext";
import { api, ApiError } from "../api/client";
import { StatusBadge } from "../components/StatusBadge";
import { AuditTrail } from "../components/AuditTrail";
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
  });

  if (contractQuery.isLoading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;
  if (contractQuery.isError || !contract) {
    return <p className="p-6 text-sm text-red-600">Contract not found.</p>;
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
        <h1 className="text-xl font-semibold">{contract.clientName}</h1>
        <StatusBadge status={contract.status} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {contract.status === "DRAFT" && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            Edit
          </button>
        )}
        {contract.status === "DRAFT" && (
          <button
            onClick={() => finalizeMutation.mutate()}
            disabled={finalizeMutation.isPending}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Finalize
          </button>
        )}
        {contract.status === "FINALIZED" && (
          <button
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending}
            className="rounded-md bg-gray-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          >
            Archive
          </button>
        )}
        {contract.status === "DRAFT" && (
          <button
            onClick={() => {
              if (confirm("Delete this draft contract? This cannot be undone.")) {
                deleteMutation.mutate();
              }
            }}
            disabled={deleteMutation.isPending}
            className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 disabled:opacity-40"
          >
            Delete draft
          </button>
        )}
      </div>

      {draft && (
        <div className="mb-8 space-y-4 rounded-md border border-gray-200 bg-white p-4">
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
            <p className="mb-2 text-sm font-medium text-gray-700">Items</p>
            <div className="space-y-2">
              {draft.items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 rounded-md bg-gray-50 p-2">
                  <div className="col-span-5">
                    <input
                      disabled={!editing}
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="Description"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
                    />
                    {fieldErrors?.[`items[${index}].description`] && (
                      <p className="text-xs text-red-600">{fieldErrors[`items[${index}].description`]}</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <input
                      disabled={!editing}
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                      placeholder="Qty"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
                    />
                    {fieldErrors?.[`items[${index}].quantity`] && (
                      <p className="text-xs text-red-600">{fieldErrors[`items[${index}].quantity`]}</p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <input
                      disabled={!editing}
                      value={item.quantity_unit ?? ""}
                      onChange={(e) => updateItem(index, { quantity_unit: e.target.value })}
                      placeholder="Unit"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      disabled={!editing}
                      type="number"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                      placeholder="Unit price"
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
                    />
                    {fieldErrors?.[`items[${index}].unit_price`] && (
                      <p className="text-xs text-red-600">{fieldErrors[`items[${index}].unit_price`]}</p>
                    )}
                  </div>
                  <div className="col-span-1 flex items-start justify-end">
                    {editing && (
                      <button onClick={() => removeItem(index)} className="text-xs text-red-600">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {editing && (
              <button onClick={addItem} className="mt-2 text-xs font-medium text-blue-600">
                + Add item
              </button>
            )}
          </div>

          {editing && (
            <div className="flex gap-2 border-t border-gray-100 pt-4">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Save
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setFieldErrors(null);
                  setDraft(contract.fieldData);
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Audit trail</h2>
        {eventsQuery.isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
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
      <span className="font-medium text-gray-700">{label}</span>
      <input
        disabled={!editing}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:border-transparent disabled:bg-transparent disabled:px-0"
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </label>
  );
}
