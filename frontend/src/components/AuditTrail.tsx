import type { ContractEvent } from "../types/contract";

const EVENT_LABEL: Record<ContractEvent["eventType"], string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  STATUS_CHANGED: "Status changed",
  DELETED: "Deleted",
};

const EVENT_DOT: Record<ContractEvent["eventType"], string> = {
  CREATED: "bg-emerald-500",
  UPDATED: "bg-blue-500",
  STATUS_CHANGED: "bg-indigo-500",
  DELETED: "bg-red-500",
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString();
}

export function AuditTrail({ events }: { events: ContractEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-gray-200 py-8 text-center dark:border-gray-800">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-8 w-8 text-gray-300 dark:text-gray-700">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l2.5 2.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <p className="text-sm text-gray-400 dark:text-gray-500">No audit events yet.</p>
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li
          key={event.id}
          className="rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-sm transition-shadow hover:shadow dark:border-gray-800 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-gray-100">
              <span className={`h-1.5 w-1.5 rounded-full ${EVENT_DOT[event.eventType]}`} />
              {EVENT_LABEL[event.eventType]}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">{formatTimestamp(event.createdAt)}</span>
          </div>
          {event.eventType === "STATUS_CHANGED" && (
            <p className="mt-1 pl-3.5 text-gray-600 dark:text-gray-400">
              {event.fromStatus ?? "—"} → {event.toStatus}
            </p>
          )}
          {event.eventType === "UPDATED" && event.payload != null && (
            <pre className="mt-1 ml-3.5 overflow-x-auto rounded bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-400">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </li>
      ))}
    </ol>
  );
}
