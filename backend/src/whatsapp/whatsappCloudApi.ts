import crypto from "node:crypto";
import { extractDealTerms, toContractInput } from "../services/dealExtractionService.js";
import * as contractService from "../services/contractService.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/AppError.js";

// How long to wait after the last message in a negotiation before treating the
// accumulated window as "the conversation paused" and running extraction/classification
// on it. Avoids creating a new draft (or even calling the model) on every single message
// of an ongoing back-and-forth. Overridable so tests can use a short real delay instead
// of the production debounce window.
const DEBOUNCE_MS = Number(process.env.WHATSAPP_DEBOUNCE_MS) || 15_000;

// Cap on how many lines we keep per negotiation, so a long-running deal never grows the
// stored transcript unbounded.
const MAX_BUFFERED_MESSAGES = 50;

type DealDirection = "WE_BUY" | "WE_SELL";
type NegotiationRole = "Buyer" | "Seller" | "Us" | "Counterparty";

// Debounce timers only — the transcript itself lives in WhatsAppNegotiation.lines in
// Postgres, so a server restart mid-negotiation loses at most a pending flush timer
// (worst case: the next message re-triggers it), never the conversation content.
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type CloudApiMessage = {
  id: string;
  from: string;
  timestamp: number; // Unix seconds, as sent by Meta
  body: string;
  senderName: string;
  phoneNumberId?: string; // which of our business numbers this arrived at (metadata.phone_number_id)
};

/** The org's own outgoing message, sent manually through a coexistence-linked WhatsApp
 * Business App and echoed to us via the smb_message_echoes field. Unlike CloudApiMessage,
 * `from` here is the org's own number and `to` is the counterparty. */
export type CloudApiEcho = {
  id: string;
  from: string;
  to: string;
  timestamp: number;
  body: string;
};

/** Roles are only "Buyer"/"Seller" once direction is known (dev/test negotiations, created
 * with an explicit direction). Coexistence-created negotiations start with direction
 * "UNKNOWN" — there's no one to ask, so lines are tagged "Us"/"Counterparty" until enough
 * conversation content lets extraction infer the real direction (see
 * extractAndMaybeCreateDraft). */
function roleFor(negotiation: { direction: string; ourPhone: string }, from: string): NegotiationRole {
  const isUs = from === negotiation.ourPhone;
  if (negotiation.direction === "WE_BUY") return isUs ? "Buyer" : "Seller";
  if (negotiation.direction === "WE_SELL") return isUs ? "Seller" : "Buyer";
  return isUs ? "Us" : "Counterparty";
}

function formatLine(
  timestampSeconds: number,
  senderName: string,
  body: string,
  role: NegotiationRole,
): string {
  const time = new Date(timestampSeconds * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `[${time}] ${role} (${senderName}): ${body}`;
}

function asLines(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/** Verifies a webhook POST actually came from Meta. Signature is an HMAC-SHA256 of the
 * raw request body, keyed with the app secret — must run against the raw bytes, since
 * re-serializing the parsed JSON is not guaranteed to reproduce the same bytes. */
export function verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/** Compares the verify token Meta sends during webhook registration against ours. */
export function verifyWebhookHandshake(mode: unknown, token: unknown): boolean {
  return mode === "subscribe" && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
}

async function alreadyProcessed(messageId: string): Promise<boolean> {
  const existing = await prisma.whatsAppProcessedMessage.findUnique({ where: { messageId } });
  return existing !== null;
}

async function markProcessed(messageId: string) {
  await prisma.whatsAppProcessedMessage
    .create({ data: { messageId } })
    .catch(() => {
      // Already marked (e.g. a concurrent retry) — fine, not a real error.
    });
}

type Resolution =
  | { type: "found"; negotiation: { id: string; orgId: string; direction: string; ourPhone: string; lines: unknown } }
  | { type: "none" }
  | { type: "ambiguous" };

/** Finds which open negotiation an incoming phone number belongs to. Neither side's
 * phone number is unique to one open deal — the org can run several negotiations at
 * once, in either direction, and can even share a phone number across them (e.g. buying
 * from one counterparty while selling to another). When a number matches more than one
 * open negotiation, this tries to disambiguate via the negotiation's own label appearing
 * in the message text; if that's still ambiguous, it deliberately does NOT guess — the
 * caller holds the message for manual routing instead. */
async function resolveNegotiation(from: string, body: string): Promise<Resolution> {
  const candidates = await prisma.whatsAppNegotiation.findMany({
    where: { status: "OPEN", OR: [{ ourPhone: from }, { counterpartyPhone: from }] },
  });

  if (candidates.length === 0) return { type: "none" };
  if (candidates.length === 1) return { type: "found", negotiation: candidates[0] };

  const bodyLower = body.toLowerCase();
  const labelMatches = candidates.filter((c) => c.label && bodyLower.includes(c.label.toLowerCase()));
  if (labelMatches.length === 1) return { type: "found", negotiation: labelMatches[0] };

  return { type: "ambiguous" };
}

async function extractAndMaybeCreateDraft(
  negotiation: { id: string; orgId: string; direction: string },
  thread: string,
) {
  try {
    const extraction = await extractDealTerms(thread);

    // Coexistence-created negotiations start with direction "UNKNOWN" (nobody declared it
    // up front) — fill it in from extraction as soon as it's inferrable, so the transcript
    // starts using "Buyer"/"Seller" tags instead of "Us"/"Counterparty" from then on.
    const directionUpdate =
      negotiation.direction === "UNKNOWN" && extraction.direction !== "UNKNOWN"
        ? { direction: extraction.direction }
        : {};

    if (extraction.deal_status !== "agreed") {
      if (Object.keys(directionUpdate).length > 0) {
        await prisma.whatsAppNegotiation.update({ where: { id: negotiation.id }, data: directionUpdate });
      }
      console.log(`[whatsapp] Negotiation ${negotiation.id} still in progress — no draft created.`);
      return;
    }

    const input = toContractInput(extraction);
    const contract = await contractService.createContract(negotiation.orgId, input);
    await prisma.whatsAppNegotiation.update({
      where: { id: negotiation.id },
      data: { ...directionUpdate, status: "AGREED", resultingContractId: contract.id },
    });
    console.log(
      `[whatsapp] Negotiation ${negotiation.id} agreed — created draft contract ${contract.id} (${contract.clientName}).`,
    );
  } catch (err) {
    console.error(`[whatsapp] Failed to process negotiation ${negotiation.id}:`, err);
  }
}

async function flushNegotiation(negotiationId: string) {
  const negotiation = await prisma.whatsAppNegotiation.findUnique({ where: { id: negotiationId } });
  if (!negotiation || negotiation.status !== "OPEN") return;

  const lines = asLines(negotiation.lines);
  if (lines.length === 0) return;

  await extractAndMaybeCreateDraft(negotiation, lines.join("\n"));
}

function scheduleFlush(negotiationId: string) {
  const existing = flushTimers.get(negotiationId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    flushTimers.delete(negotiationId);
    void flushNegotiation(negotiationId);
  }, DEBOUNCE_MS);
  flushTimers.set(negotiationId, timer);
}

async function appendLine(negotiationId: string, currentLines: unknown, line: string) {
  const lines = [...asLines(currentLines), line].slice(-MAX_BUFFERED_MESSAGES);
  await prisma.whatsAppNegotiation.update({ where: { id: negotiationId }, data: { lines } });
}

type ConnectionMode =
  | { type: "test" }
  | { type: "coexistence"; orgId: string; ourPhone: string }
  | { type: "unknown" };

/** Decides which of the two parallel WhatsApp setups an incoming webhook event belongs to,
 * based on which business phone number it names. The single shared Meta test number (env
 * vars, dev/test only) uses the original explicit-negotiation-registration flow unchanged;
 * any other number is looked up in WhatsAppConnection — an org that went through Embedded
 * Signup — and uses the newer auto-pairing flow. Anything matching neither is dropped. */
async function resolveConnectionMode(phoneNumberId: string | undefined): Promise<ConnectionMode> {
  if (!phoneNumberId) return { type: "unknown" };
  if (phoneNumberId === process.env.WHATSAPP_CLOUD_API_PHONE_NUMBER_ID) return { type: "test" };

  const connection = await prisma.whatsAppConnection.findUnique({ where: { phoneNumberId } });
  if (connection) {
    return { type: "coexistence", orgId: connection.orgId, ourPhone: connection.displayPhoneNumber };
  }
  return { type: "unknown" };
}

/** For a coexistence-connected org, one counterparty phone number is enough to identify one
 * negotiation — both `messages` (from the counterparty) and `smb_message_echoes` (from us)
 * name the same counterparty number, so there's no registration and no ambiguity to resolve
 * the way the dev/test explicit-registration flow needs. First contact from a number auto-
 * creates the negotiation; direction is left UNKNOWN until extraction infers it. */
async function findOrCreateAutoNegotiation(orgId: string, ourPhone: string, counterpartyPhone: string) {
  const existing = await prisma.whatsAppNegotiation.findFirst({
    where: { orgId, counterpartyPhone, status: "OPEN" },
  });
  if (existing) return existing;

  return prisma.whatsAppNegotiation.create({
    data: { orgId, ourPhone, counterpartyPhone, direction: "UNKNOWN" },
  });
}

async function appendMessageToNegotiation(
  negotiation: { id: string; lines: unknown },
  role: NegotiationRole,
  timestamp: number,
  senderName: string,
  body: string,
) {
  const line = formatLine(timestamp, senderName, body, role);
  await appendLine(negotiation.id, negotiation.lines, line);
  scheduleFlush(negotiation.id);
}

/** Handles one incoming Cloud API text message. Dedupes by Meta's own message id (Meta
 * redelivers a webhook if we don't ack fast enough), routes it to the right negotiation,
 * and debounces the actual extraction/classification. */
export async function handleIncomingMessage(message: CloudApiMessage) {
  if (await alreadyProcessed(message.id)) return;
  await markProcessed(message.id);

  const mode = await resolveConnectionMode(message.phoneNumberId);

  if (mode.type === "unknown") {
    console.warn(
      `[whatsapp] Message received for unrecognized phone_number_id ${message.phoneNumberId} — dropping.`,
    );
    return;
  }

  if (mode.type === "coexistence") {
    const negotiation = await findOrCreateAutoNegotiation(mode.orgId, mode.ourPhone, message.from);
    const role = roleFor(negotiation, message.from);
    await appendMessageToNegotiation(negotiation, role, message.timestamp, message.senderName, message.body);
    return;
  }

  // mode.type === "test" — the original dev/test flow, unchanged.
  const resolution = await resolveNegotiation(message.from, message.body);

  if (resolution.type === "none") {
    console.warn(`[whatsapp] No open negotiation found for ${message.from} — dropping message.`);
    return;
  }

  if (resolution.type === "ambiguous") {
    const candidates = await prisma.whatsAppNegotiation.findMany({
      where: { status: "OPEN", OR: [{ ourPhone: message.from }, { counterpartyPhone: message.from }] },
      select: { orgId: true },
      take: 1,
    });
    await prisma.whatsAppUnmatchedMessage.create({
      data: { orgId: candidates[0].orgId, from: message.from, body: message.body },
    });
    console.warn(
      `[whatsapp] Message from ${message.from} matches multiple open negotiations — held for manual routing.`,
    );
    return;
  }

  const { negotiation } = resolution;
  const role = roleFor(negotiation, message.from);
  await appendMessageToNegotiation(negotiation, role, message.timestamp, message.senderName, message.body);
}

/** Handles one echoed outgoing message (smb_message_echoes) — the org's own reply, sent
 * manually through a coexistence-linked WhatsApp Business App. Only ever fires for
 * coexistence-connected numbers; keyed by `echo.to` (the counterparty), the same identity
 * incoming messages from that counterparty use, so both directions land in one negotiation. */
export async function handleMessageEcho(echo: CloudApiEcho, phoneNumberId: string | undefined) {
  if (await alreadyProcessed(echo.id)) return;
  await markProcessed(echo.id);

  const mode = await resolveConnectionMode(phoneNumberId);
  if (mode.type !== "coexistence") {
    console.warn(`[whatsapp] Echo received for non-coexistence phone_number_id ${phoneNumberId} — dropping.`);
    return;
  }

  const negotiation = await findOrCreateAutoNegotiation(mode.orgId, mode.ourPhone, echo.to);
  const role = roleFor(negotiation, mode.ourPhone);
  await appendMessageToNegotiation(negotiation, role, echo.timestamp, "You", echo.body);
}

export type CreateNegotiationInput = {
  orgId: string;
  ourPhone: string;
  counterpartyPhone: string;
  direction: DealDirection;
  label?: string;
};

export async function createNegotiation(input: CreateNegotiationInput) {
  return prisma.whatsAppNegotiation.create({
    data: {
      orgId: input.orgId,
      ourPhone: input.ourPhone,
      counterpartyPhone: input.counterpartyPhone,
      direction: input.direction,
      label: input.label,
    },
  });
}

export async function listNegotiations(orgId: string) {
  return prisma.whatsAppNegotiation.findMany({ where: { orgId }, orderBy: { updatedAt: "desc" } });
}

export async function abandonNegotiation(orgId: string, negotiationId: string) {
  const negotiation = await prisma.whatsAppNegotiation.findFirst({ where: { id: negotiationId, orgId } });
  if (!negotiation) throw new AppError(404, "Negotiation not found");
  if (negotiation.status !== "OPEN") throw new AppError(400, "Only open negotiations can be abandoned");
  return prisma.whatsAppNegotiation.update({ where: { id: negotiationId }, data: { status: "ABANDONED" } });
}

export async function listUnmatchedMessages(orgId: string) {
  return prisma.whatsAppUnmatchedMessage.findMany({ where: { orgId }, orderBy: { receivedAt: "desc" } });
}

export async function assignUnmatchedMessage(orgId: string, messageId: string, negotiationId: string) {
  const message = await prisma.whatsAppUnmatchedMessage.findFirst({ where: { id: messageId, orgId } });
  if (!message) throw new AppError(404, "Message not found");

  const negotiation = await prisma.whatsAppNegotiation.findFirst({
    where: { id: negotiationId, orgId, status: "OPEN" },
  });
  if (!negotiation) throw new AppError(404, "Open negotiation not found");

  const role = roleFor(negotiation, message.from);
  const receivedAtSeconds = Math.floor(message.receivedAt.getTime() / 1000);
  const line = formatLine(receivedAtSeconds, message.from, message.body, role);
  const lines = [...asLines(negotiation.lines), line].slice(-MAX_BUFFERED_MESSAGES);

  await prisma.$transaction([
    prisma.whatsAppNegotiation.update({ where: { id: negotiation.id }, data: { lines } }),
    prisma.whatsAppUnmatchedMessage.delete({ where: { id: message.id } }),
  ]);

  scheduleFlush(negotiation.id);
}

export type WhatsAppConnectionInput = {
  orgId: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
  accessToken: string;
};

/** Stores (or replaces) an org's Embedded Signup connection — the one-time result of the
 * OAuth-style handshake in whatsappOnboarding.ts. From then on, any webhook event naming
 * this phoneNumberId routes through the auto-pairing coexistence flow for this org. */
export async function createConnection(input: WhatsAppConnectionInput) {
  return prisma.whatsAppConnection.upsert({
    where: { orgId: input.orgId },
    create: input,
    update: input,
  });
}

export async function getConnection(orgId: string) {
  return prisma.whatsAppConnection.findUnique({ where: { orgId } });
}

export type CloudApiConfigStatus = {
  configured: boolean;
  missing: string[];
};

/** Reports whether the required Cloud API env vars are present — the setup page uses
 * this to show "webhook is ready to receive messages" vs "still needs configuring". */
export function getConfigStatus(): CloudApiConfigStatus {
  const required = [
    "WHATSAPP_CLOUD_API_TOKEN",
    "WHATSAPP_CLOUD_API_PHONE_NUMBER_ID",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
  ];
  const missing = required.filter((name) => !process.env[name]);
  return { configured: missing.length === 0, missing };
}
