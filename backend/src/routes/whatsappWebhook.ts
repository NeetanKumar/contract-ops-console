import { Router, raw } from "express";
import {
  verifyWebhookHandshake,
  verifyWebhookSignature,
  handleIncomingMessage,
  handleMessageEcho,
  type CloudApiMessage,
  type CloudApiEcho,
} from "../whatsapp/whatsappCloudApi.js";

export const whatsappWebhookRouter = Router();

// Meta calls this once when you register the webhook URL, to prove you control it.
whatsappWebhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (verifyWebhookHandshake(mode, token)) {
    res.status(200).type("text/plain").send(String(challenge ?? ""));
    return;
  }
  res.sendStatus(403);
});

type WebhookMessage = {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
};

// smb_message_echoes shape: same envelope as `messages`, but each entry carries both `from`
// (our own number) and `to` (the counterparty) — see whatsappCloudApi.ts's handleMessageEcho.
type WebhookMessageEcho = {
  from: string;
  to: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
};

type WebhookValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id: string }[];
  messages?: WebhookMessage[];
  message_echoes?: WebhookMessageEcho[];
};

type WebhookPayload = {
  entry?: { changes?: { value: WebhookValue }[] }[];
};

// Needs the raw body (not the JSON-parsed one) to verify Meta's signature — this route
// is mounted before the app-wide express.json() middleware ever sees it.
whatsappWebhookRouter.post("/", raw({ type: "application/json" }), (req, res) => {
  // Ack immediately — Meta retries (redelivering the same message) if it doesn't get a
  // fast 200, which is exactly the duplicate-delivery case the message-id dedup guards.
  res.sendStatus(200);

  const rawBody = req.body as Buffer;
  const signature = req.header("X-Hub-Signature-256");
  if (!verifyWebhookSignature(rawBody, signature)) {
    console.warn("[whatsapp] Webhook signature verification failed — ignoring payload.");
    return;
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody.toString("utf-8"));
  } catch {
    console.warn("[whatsapp] Webhook payload was not valid JSON — ignoring.");
    return;
  }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      const nameByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const message of value.messages ?? []) {
        if (message.type !== "text" || !message.text?.body) continue;

        const cloudMessage: CloudApiMessage = {
          id: message.id,
          from: message.from,
          timestamp: parseInt(message.timestamp, 10),
          body: message.text.body,
          senderName: nameByWaId.get(message.from) ?? message.from,
          phoneNumberId,
        };

        handleIncomingMessage(cloudMessage).catch((err: unknown) => {
          console.error("[whatsapp] Failed to handle incoming message:", err);
        });
      }

      for (const echo of value.message_echoes ?? []) {
        if (echo.type !== "text" || !echo.text?.body) continue;

        const cloudEcho: CloudApiEcho = {
          id: echo.id,
          from: echo.from,
          to: echo.to,
          timestamp: parseInt(echo.timestamp, 10),
          body: echo.text.body,
        };

        handleMessageEcho(cloudEcho, phoneNumberId).catch((err: unknown) => {
          console.error("[whatsapp] Failed to handle message echo:", err);
        });
      }
    }
  }
});
