import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOrg } from "../context/OrgContext";
import { api, ApiError } from "../api/client";
import type { FieldErrors } from "../types/contract";

const PLACEHOLDER = `{
  "client_name": "Acme Corp",
  "po_ref_no": "PO-1234",
  "po_date": "2026-01-15",
  "payment_terms": "Net 30",
  "delivery_terms": "FOB Origin",
  "items": [
    { "description": "Widget", "quantity": 10, "unit_price": 25 }
  ]
}`;

export function UploadPage() {
  const { selectedOrgId } = useOrg();
  const navigate = useNavigate();
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setJsonText(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    setParseError(null);
    setFieldErrors(null);
    setGenericError(null);

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
      return;
    }

    if (!selectedOrgId) return;

    setSubmitting(true);
    try {
      const contract = await api.createContract(selectedOrgId, parsed);
      navigate(`/contracts/${contract.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else if (err instanceof ApiError) {
        setGenericError(err.message);
      } else {
        setGenericError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-xl font-semibold">Upload contract</h1>

      <label className="mb-2 block text-sm font-medium text-gray-700">
        Contract JSON
        <textarea
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={16}
          className="mt-1 block w-full rounded-md border border-gray-300 p-3 font-mono text-xs"
        />
      </label>

      <div className="mb-4 flex items-center gap-3">
        <input
          type="file"
          accept="application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="text-sm"
        />
        <button
          onClick={handleSubmit}
          disabled={!jsonText.trim() || submitting}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>

      {parseError && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">Invalid JSON: {parseError}</p>
      )}

      {genericError && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{genericError}</p>}

      {fieldErrors && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="mb-2 text-sm font-medium text-red-800">
            The contract couldn't be saved — fix the fields below:
          </p>
          <ul className="space-y-1 text-sm text-red-700">
            {Object.entries(fieldErrors).map(([field, message]) => (
              <li key={field}>
                <span className="font-mono">{field}</span>: {message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
