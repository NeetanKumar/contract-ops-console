import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "../context/OrgContext";
import { api, toErrorMessage, API_URL } from "../api/client";
import type { WhatsAppNegotiationStatus } from "../types/contract";

const WEBHOOK_URL = `${API_URL}/api/whatsapp/webhook`;

const STATUS_STYLES: Record<WhatsAppNegotiationStatus, string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  AGREED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  ABANDONED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function WhatsAppSetupPage() {
  const { selectedOrgId } = useOrg();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [ourPhone, setOurPhone] = useState("");
  const [counterpartyPhone, setCounterpartyPhone] = useState("");
  const [direction, setDirection] = useState<"WE_BUY" | "WE_SELL">("WE_BUY");
  const [label, setLabel] = useState("");

  const statusQuery = useQuery({
    queryKey: ["whatsapp-cloud-status", selectedOrgId],
    queryFn: () => api.getCloudApiStatus(selectedOrgId!),
    enabled: !!selectedOrgId,
  });

  const negotiationsQuery = useQuery({
    queryKey: ["whatsapp-negotiations", selectedOrgId],
    queryFn: () => api.listWhatsAppNegotiations(selectedOrgId!),
    enabled: !!selectedOrgId,
  });

  const unmatchedQuery = useQuery({
    queryKey: ["whatsapp-unmatched-messages", selectedOrgId],
    queryFn: () => api.listUnmatchedMessages(selectedOrgId!),
    enabled: !!selectedOrgId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createWhatsAppNegotiation(selectedOrgId!, {
        ourPhone,
        counterpartyPhone,
        direction,
        label: label || undefined,
      }),
    onSuccess: () => {
      setOurPhone("");
      setCounterpartyPhone("");
      setLabel("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-negotiations", selectedOrgId] });
    },
    onError: (err) => setError(toErrorMessage(err, "Failed to start negotiation")),
  });

  const abandonMutation = useMutation({
    mutationFn: (id: string) => api.abandonWhatsAppNegotiation(selectedOrgId!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-negotiations", selectedOrgId] });
    },
    onError: (err) => setError(toErrorMessage(err, "Failed to abandon negotiation")),
  });

  const assignMutation = useMutation({
    mutationFn: ({ messageId, negotiationId }: { messageId: string; negotiationId: string }) =>
      api.assignUnmatchedMessage(selectedOrgId!, messageId, negotiationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-unmatched-messages", selectedOrgId] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-negotiations", selectedOrgId] });
    },
    onError: (err) => setError(toErrorMessage(err, "Failed to assign message")),
  });

  const status = statusQuery.data;
  const negotiations = negotiationsQuery.data?.negotiations ?? [];
  const openNegotiations = negotiations.filter((n) => n.status === "OPEN");
  const unmatchedMessages = unmatchedQuery.data?.messages ?? [];

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight text-gray-800 dark:text-gray-100">
          WhatsApp setup (dev/test number)
        </h1>
        <Link to="/whatsapp-onboarding" className="text-xs text-indigo-500 hover:underline">
          Connect a real business number instead →
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Start a negotiation below before messaging begins, linking your number and the
        counterparty's number to one deal. A draft contract is only created once the thread shows a
        clear final agreement — not from an opening offer. This page uses the single shared Meta
        test number for development; real orgs should connect their own number instead.
      </p>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2">
          {status && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                status.configured
                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
              }`}
            >
              {status.configured ? "Webhook configured" : "Webhook not configured"}
            </span>
          )}
        </div>

        {status && !status.configured && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            Missing environment variables on the backend: {status.missing.join(", ")}. Set these from
            your Meta app's WhatsApp product dashboard, then restart the backend.
          </div>
        )}

        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="col-span-1 text-sm text-gray-600 dark:text-gray-400">
            Our phone (verified test number)
            <input
              value={ourPhone}
              onChange={(e) => setOurPhone(e.target.value)}
              placeholder="+15551234567"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="col-span-1 text-sm text-gray-600 dark:text-gray-400">
            Counterparty phone
            <input
              value={counterpartyPhone}
              onChange={(e) => setCounterpartyPhone(e.target.value)}
              placeholder="+15557654321"
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="col-span-1 text-sm text-gray-600 dark:text-gray-400">
            Direction
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as "WE_BUY" | "WE_SELL")}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="WE_BUY">We're buying</option>
              <option value="WE_SELL">We're selling</option>
            </select>
          </label>
          <label className="col-span-1 text-sm text-gray-600 dark:text-gray-400">
            Label (optional)
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. AgroTrade soybean deal"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <div className="col-span-2 text-xs text-gray-400 dark:text-gray-500">
            If either phone number is already part of another open negotiation, mention this label in
            your WhatsApp messages so incoming messages route to the right deal.
          </div>
          <button
            type="submit"
            disabled={!selectedOrgId || createMutation.isPending}
            className="col-span-2 justify-self-start rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-600 disabled:opacity-40"
          >
            {createMutation.isPending ? "Starting…" : "Start negotiation"}
          </button>
        </form>

        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            One-time setup in your Meta app's WhatsApp dashboard
          </p>
          <ol className="list-inside list-decimal space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
            <li>
              Under Configuration, set the webhook callback URL to:
              <code className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-900">
                {WEBHOOK_URL}
              </code>
            </li>
            <li>Enter the same value you set for `WHATSAPP_WEBHOOK_VERIFY_TOKEN` as the verify token.</li>
            <li>Subscribe the webhook to the `messages` field.</li>
            <li>
              In local development, the callback URL must be a public HTTPS address (e.g. via
              `ngrok http 4000`) — Meta can't reach `localhost` directly.
            </li>
          </ol>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {unmatchedMessages.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
          <p className="mb-3 text-sm font-medium text-amber-800 dark:text-amber-300">
            Needs manual routing — these came from a phone number tied to more than one open
            negotiation and couldn't be auto-assigned
          </p>
          <div className="space-y-3">
            {unmatchedMessages.map((message) => {
              const candidates = openNegotiations.filter(
                (n) => n.ourPhone === message.from || n.counterpartyPhone === message.from,
              );
              return (
                <div
                  key={message.id}
                  className="rounded-md border border-amber-200 bg-white p-3 text-sm dark:border-amber-900/40 dark:bg-gray-900"
                >
                  <p className="text-gray-500 dark:text-gray-400">
                    From {message.from} · {new Date(message.receivedAt).toLocaleString()}
                  </p>
                  <p className="mt-1 text-gray-800 dark:text-gray-200">{message.body}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <select
                      id={`assign-${message.id}`}
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Assign to negotiation…
                      </option>
                      {candidates.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.label ?? `${n.ourPhone} <-> ${n.counterpartyPhone}`}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const select = document.getElementById(`assign-${message.id}`) as HTMLSelectElement | null;
                        if (select?.value) {
                          assignMutation.mutate({ messageId: message.id, negotiationId: select.value });
                        }
                      }}
                      disabled={assignMutation.isPending}
                      className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-40 dark:bg-gray-700 dark:hover:bg-gray-600"
                    >
                      Assign
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Negotiations</p>
        {negotiations.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">No negotiations started yet.</p>
        )}
        <div className="space-y-2">
          {negotiations.map((negotiation) => (
            <details
              key={negotiation.id}
              className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-800"
            >
              <summary className="flex cursor-pointer items-center gap-2 text-sm">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[negotiation.status]}`}>
                  {negotiation.status}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                  {negotiation.direction === "WE_BUY"
                    ? "Buying from"
                    : negotiation.direction === "WE_SELL"
                      ? "Selling to"
                      : "Direction pending —"}
                </span>
                <span className="font-medium text-gray-800 dark:text-gray-100">
                  {negotiation.label ?? negotiation.counterpartyPhone}
                </span>
                {negotiation.status === "AGREED" && negotiation.resultingContractId && (
                  <Link
                    to={`/contracts/${negotiation.resultingContractId}`}
                    className="ml-auto text-xs text-indigo-500 hover:underline"
                  >
                    View contract
                  </Link>
                )}
                {negotiation.status === "OPEN" && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      abandonMutation.mutate(negotiation.id);
                    }}
                    disabled={abandonMutation.isPending}
                    className="ml-auto text-xs text-red-500 hover:underline disabled:opacity-40"
                  >
                    Abandon
                  </button>
                )}
              </summary>
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600 dark:border-gray-700 dark:text-gray-400">
                {negotiation.lines.length === 0 ? (
                  <p className="italic text-gray-400">No messages yet.</p>
                ) : (
                  negotiation.lines.map((line, i) => <p key={i}>{line}</p>)
                )}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
