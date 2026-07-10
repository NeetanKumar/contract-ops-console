import type { Response } from "express";

const HEARTBEAT_INTERVAL_MS = 20_000;

type StatusChangedEvent = {
  contract_id: string;
  from_status: string | null;
  to_status: string;
};

const connectionsByOrg = new Map<string, Set<Response>>();

export function registerConnection(orgId: string, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  let connections = connectionsByOrg.get(orgId);
  if (!connections) {
    connections = new Set();
    connectionsByOrg.set(orgId, connections);
  }
  connections.add(res);

  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, HEARTBEAT_INTERVAL_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    connections?.delete(res);
    if (connections && connections.size === 0) {
      connectionsByOrg.delete(orgId);
    }
  };

  res.req.on("close", cleanup);
}

export function broadcastStatusChanged(orgId: string, event: StatusChangedEvent) {
  const connections = connectionsByOrg.get(orgId);
  if (!connections) return;

  const payload = `event: contract_status_changed\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of connections) {
    res.write(payload);
  }
}
