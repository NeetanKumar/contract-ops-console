import type { ContractEvent } from "../types/contract";

const EVENT_LABEL: Record<ContractEvent["eventType"], string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  STATUS_CHANGED: "Status changed",
  DELETED: "Deleted",
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString();
}

export function AuditTrail({ events }: { events: ContractEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-gray-500">No audit events yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">{EVENT_LABEL[event.eventType]}</span>
            <span className="text-xs text-gray-500">{formatTimestamp(event.createdAt)}</span>
          </div>
          {event.eventType === "STATUS_CHANGED" && (
            <p className="mt-1 text-gray-600">
              {event.fromStatus ?? "—"} → {event.toStatus}
            </p>
          )}
          {event.eventType === "UPDATED" && event.payload != null && (
            <pre className="mt-1 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-600">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}
