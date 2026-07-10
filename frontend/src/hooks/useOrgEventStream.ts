import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL } from "../api/client";
import { useToast } from "../context/ToastContext";

type StatusChangedPayload = {
  contract_id: string;
  from_status: string | null;
  to_status: string;
};

/**
 * Opens one EventSource per selected org and keeps the contract list/detail/audit
 * queries fresh when another tab finalizes or archives a contract. EventSource
 * reconnects on its own after a drop; we just surface connection state for a
 * "reconnecting" indicator.
 */
export function useOrgEventStream(orgId: string | null) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [connectionState, setConnectionState] = useState<"connecting" | "connected" | "reconnecting">(
    "connecting",
  );

  useEffect(() => {
    if (!orgId) return;

    setConnectionState("connecting");
    const source = new EventSource(`${API_URL}/api/organisations/${orgId}/events/stream`);

    source.onopen = () => setConnectionState("connected");
    source.onerror = () => setConnectionState("reconnecting");

    source.addEventListener("contract_status_changed", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as StatusChangedPayload;
      queryClient.invalidateQueries({ queryKey: ["contracts", orgId] });
      queryClient.invalidateQueries({ queryKey: ["contract", data.contract_id] });
      queryClient.invalidateQueries({ queryKey: ["contractEvents", data.contract_id] });
      showToast(`Contract status changed: ${data.from_status ?? "—"} → ${data.to_status}`);
    });

    return () => source.close();
  }, [orgId, queryClient, showToast]);

  return connectionState;
}
