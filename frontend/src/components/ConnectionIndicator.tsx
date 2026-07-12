type ConnectionState = "connecting" | "connected" | "reconnecting";

const LABEL: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  connected: "Live",
  reconnecting: "Reconnecting…",
};

const DOT_COLOR: Record<ConnectionState, string> = {
  connecting: "bg-gray-400",
  connected: "bg-green-500",
  reconnecting: "bg-amber-500 animate-pulse",
};

export function ConnectionIndicator({ state }: { state: ConnectionState }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
      <span className={`h-2 w-2 rounded-full ${DOT_COLOR[state]}`} />
      {LABEL[state]}
    </span>
  );
}
