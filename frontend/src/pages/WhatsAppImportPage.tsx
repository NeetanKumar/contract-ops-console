import { useState } from "react";
import { Link } from "react-router-dom";
import { useOrg } from "../context/OrgContext";
import { api, toErrorMessage } from "../api/client";
import { inputBaseClass } from "../lib/inputStyles";
import type { DealExtraction, DealLineItem, ExtractedField } from "../types/contract";

const PLACEHOLDER = `[10:02 AM] Ravi: Hey, need 500 MT of soybean meal
[10:03 AM] Ravi: can you do 42000 per MT?
[10:05 AM] Priya (AgroTrade Ltd): 42000 works, delivery by Aug 15 ok?
[10:06 AM] Ravi: yes deal, Aug 15 2026 fine`;

const LOW_CONFIDENCE_THRESHOLD = 0.7;

const LINE_ITEM_FIELD_LABELS: Record<keyof DealLineItem, string> = {
  commodity: "Commodity",
  quantity: "Quantity",
  unit: "Unit",
  price: "Price",
};

function ExtractedFieldCard({ label, field }: { label: string; field: ExtractedField<string | number> }) {
  const lowConfidence = field.confidence < LOW_CONFIDENCE_THRESHOLD;
  return (
    <div
      className={`rounded-md border p-2.5 ${
        lowConfidence
          ? "border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30"
          : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40"
      }`}
    >
      <dt className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
        {lowConfidence && (
          <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/60 dark:text-amber-300">
            Low confidence
          </span>
        )}
      </dt>
      <dd className="mt-0.5 text-sm text-gray-800 dark:text-gray-100">
        {field.value === null ? (
          <span className="italic text-gray-400 dark:text-gray-500">Not found</span>
        ) : (
          String(field.value)
        )}
        <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
          ({Math.round(field.confidence * 100)}%)
        </span>
      </dd>
    </div>
  );
}

function ExtractionSummary({ extraction }: { extraction: DealExtraction }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium dark:bg-gray-900">
          {extraction.deal_status === "agreed" ? "Agreed" : "Still negotiating"}
        </span>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium dark:bg-gray-900">
          {extraction.direction === "WE_BUY"
            ? "We're buying"
            : extraction.direction === "WE_SELL"
              ? "We're selling"
              : "Direction unclear"}
        </span>
      </div>

      {extraction.items.map((item, i) => (
        <dl key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {extraction.items.length > 1 && (
            <p className="col-span-full text-xs font-semibold text-gray-500 dark:text-gray-400">
              Line item {i + 1}
            </p>
          )}
          {(Object.keys(LINE_ITEM_FIELD_LABELS) as (keyof DealLineItem)[]).map((key) => (
            <ExtractedFieldCard key={key} label={LINE_ITEM_FIELD_LABELS[key]} field={item[key]} />
          ))}
        </dl>
      ))}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ExtractedFieldCard label="Counterparty" field={extraction.counterparty} />
        <ExtractedFieldCard label="Delivery date" field={extraction.delivery_date} />
      </dl>
    </div>
  );
}

export function WhatsAppImportPage() {
  const { selectedOrgId } = useOrg();
  const [thread, setThread] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ contractId: string; extraction: DealExtraction } | null>(null);

  const handleSubmit = async () => {
    if (!selectedOrgId || !thread.trim()) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const { contract, extraction } = await api.createContractFromWhatsApp(selectedOrgId, thread);
      setResult({ contractId: contract.id, extraction });
    } catch (err) {
      setError(toErrorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">
          Import from WhatsApp
        </h1>
        <Link
          to="/whatsapp-setup"
          className="text-sm font-medium text-indigo-500 hover:text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Connect WhatsApp →
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Paste a chat thread where a deal was agreed. We'll extract the terms and create a draft
        contract for you to review and correct. Or connect WhatsApp to do this automatically.
      </p>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          Chat thread
          <textarea
            value={thread}
            onChange={(e) => setThread(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={10}
            className={`mt-1 block w-full ${inputBaseClass} p-3 font-mono text-xs focus:border-indigo-400 focus:outline-none dark:bg-gray-900`}
          />
        </label>

        <button
          onClick={handleSubmit}
          disabled={!thread.trim() || submitting}
          className="rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-600 disabled:opacity-40"
        >
          {submitting ? "Extracting…" : "Extract & create draft"}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
          <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            Draft contract created. Fields flagged below need your review before finalizing.
          </p>
          <ExtractionSummary extraction={result.extraction} />
          <Link
            to={`/contracts/${result.contractId}`}
            className="mt-4 inline-block rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-600"
          >
            Review & edit draft
          </Link>
        </div>
      )}
    </div>
  );
}
