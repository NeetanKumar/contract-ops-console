import type { Response } from "express";

const HEARTBEAT_INTERVAL_MS = 20_000;

type StatusChangedEvent = {
  contract_id: string;
  from_status: string | null;
  to_status: string;
};

const connectionsByOrg = new Map<string, Set<Response>>();

function safeWrite(res: Response, chunk: string, cleanup: () => void) {
  try {
    if (res.writableEnded || res.destroyed) {
      cleanup();
      return;
    }
    res.write(chunk);
  } catch {
    // Socket died between our liveness check and the write — treat like a close.
    cleanup();
  }
}

export function registerConnection(orgId: string, res: Response) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let connections = connectionsByOrg.get(orgId);
  if (!connections) {
    connections = new Set();
    connectionsByOrg.set(orgId, connections);
  }
  connections.add(res);

  const cleanup = () => {
    clearInterval(heartbeat);
    connections?.delete(res);
    if (connections && connections.size === 0) {
      connectionsByOrg.delete(orgId);
    }
  };

  safeWrite(res, ": connected\n\n", cleanup);

  const heartbeat = setInterval(() => {
    safeWrite(res, ": heartbeat\n\n", cleanup);
  }, HEARTBEAT_INTERVAL_MS);

  res.req.on("close", cleanup);
  res.req.on("error", cleanup);
  res.on("error", cleanup);
}

export function broadcastStatusChanged(orgId: string, event: StatusChangedEvent) {
  const connections = connectionsByOrg.get(orgId);
  if (!connections) return;

  const payload = `event: contract_status_changed\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of connections) {
    safeWrite(res, payload, () => connections.delete(res));
  }
}
