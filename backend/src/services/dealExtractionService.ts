import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "../lib/AppError.js";

const MODEL = "claude-sonnet-5";

export type ExtractedField<T> = {
  value: T | null;
  confidence: number; // 0..1
};

export type DealStatus = "negotiating" | "agreed";
export type DealDirection = "WE_BUY" | "WE_SELL" | "UNKNOWN";

export type DealLineItem = {
  commodity: ExtractedField<string>;
  quantity: ExtractedField<number>;
  unit: ExtractedField<string>;
  price: ExtractedField<number>;
};

export type DealExtraction = {
  deal_status: DealStatus;
  direction: DealDirection;
  items: DealLineItem[];
  counterparty: ExtractedField<string>;
  delivery_date: ExtractedField<string>;
};

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "record_deal_terms",
  description:
    "Record the commodity trade deal terms extracted from a WhatsApp-style chat thread, with a confidence score per field.",
  input_schema: {
    type: "object",
    properties: {
      deal_status: {
        type: "string",
        enum: ["negotiating", "agreed"],
        description:
          "Whether this thread has reached a final, explicit agreement on terms, or is still being " +
          "negotiated. Only use 'agreed' if the thread shows a clear, unambiguous confirmation from " +
          "the parties (e.g. 'deal', 'agreed', 'confirmed', 'let's finalize at X') on all major terms. " +
          "Numbers being mentioned, offered, or countered — without an explicit confirmation — is " +
          "still 'negotiating', even if only one price has been mentioned so far.",
      },
      direction: {
        type: "string",
        enum: ["WE_BUY", "WE_SELL", "UNKNOWN"],
        description:
          "Whether the org running this software ('Us', or a party already labeled 'Buyer'/'Seller' " +
          "if the thread already tags roles that way) is buying or selling in this deal. Infer from " +
          "context — who is offering to sell the commodity, who is asking to buy it. Use 'UNKNOWN' " +
          "only if this genuinely can't be told yet from the thread so far.",
      },
      items: {
        type: "array",
        description:
          "One entry per distinct commodity in this deal. Most deals only ever have one — but if the " +
          "thread genuinely covers more than one commodity (e.g. 'wheat AND soybean meal'), report each " +
          "as its own entry here rather than merging or picking just one. Never drop a commodity that's " +
          "part of the deal just because there's more than one.",
        items: {
          type: "object",
          properties: {
            commodity: fieldSchema("string", "The commodity being traded, e.g. 'wheat', 'crude palm oil'."),
            quantity: fieldSchema("number", "The numeric quantity agreed, without the unit."),
            unit: fieldSchema("string", "The unit of measure for quantity, e.g. 'MT', 'tonnes', 'bbl'."),
            price: fieldSchema("number", "The numeric price per unit agreed, without currency symbol."),
          },
          required: ["commodity", "quantity", "unit", "price"],
        },
      },
      counterparty: fieldSchema("string", "The name of the other trading party/company in the deal."),
      delivery_date: fieldSchema(
        "string",
        "The agreed delivery date in YYYY-MM-DD format. Resolve relative dates (e.g. 'next Friday') using the thread's own timestamps if present.",
      ),
    },
    required: ["deal_status", "direction", "items", "counterparty", "delivery_date"],
  },
};

function fieldSchema(valueType: "string" | "number", description: string) {
  return {
    type: "object",
    description,
    properties: {
      value: { type: [valueType, "null"], description: "The extracted value, or null if not present in the thread." },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence that this value is correct and unambiguous, from 0 to 1.",
      },
    },
    required: ["value", "confidence"],
  };
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AppError(500, "ANTHROPIC_API_KEY is not configured on the server");
  }
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

/** Maps a raw extraction onto the existing contract input shape (contractSchema.ts).
 * The two schemas don't line up field-for-field, so this is an explicit, lossy mapping:
 * - counterparty -> client_name
 * - items[] -> items[], one line per extracted commodity (contractSchema already
 *   supports multiple lines; extraction just never used to take advantage of that)
 * - delivery_date -> delivery_terms (free text; NOT po_date, which means something
 *   different — the purchase order date, not the agreed delivery date)
 * - po_ref_no has no extraction equivalent, so it's a clearly-marked placeholder the
 *   user is expected to edit before finalizing the draft.
 */
export function toContractInput(extraction: DealExtraction) {
  const today = new Date().toISOString().slice(0, 10);
  const items =
    extraction.items.length > 0
      ? extraction.items.map((item) => ({
          description: item.commodity.value ?? "Unknown commodity",
          // contractSchema requires quantity > 0, so a missing value falls back to a
          // clearly-wrong placeholder (1) rather than 0, which would fail validation.
          quantity: item.quantity.value ?? 1,
          quantity_unit: item.unit.value ?? undefined,
          unit_price: item.price.value ?? 0,
        }))
      : [{ description: "Unknown commodity", quantity: 1, unit_price: 0 }];

  return {
    client_name: extraction.counterparty.value ?? "Unknown counterparty",
    po_ref_no: `WA-${Date.now()}`,
    po_date: today,
    delivery_terms: extraction.delivery_date.value ?? undefined,
    items,
  };
}

export async function extractDealTerms(chatThread: string): Promise<DealExtraction> {
  const anthropic = getClient();

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "record_deal_terms" },
    messages: [
      {
        role: "user",
        content:
          "This thread is a negotiation between two parties over WhatsApp, tagged per line either as " +
          "'Buyer'/'Seller' (roles already known) or as 'Us'/'Counterparty' (roles not yet determined — " +
          "you should work out from context whether 'Us' is buying or selling). It may still be ongoing " +
          "(offers and counter-offers with no final agreement yet) or may have concluded with both sides " +
          "confirming terms. First classify deal_status: 'agreed' only if there's an explicit, " +
          "unambiguous final confirmation of terms; otherwise 'negotiating'. Also classify direction: " +
          "if roles are already tagged 'Buyer'/'Seller', report whichever direction that implies for the " +
          "org (see the direction field's own description); if tagged 'Us'/'Counterparty', infer from " +
          "content who is buying and who is selling. Then extract the commodity trade deal terms as they " +
          "currently stand (the latest/most final numbers mentioned, even mid-negotiation) — as one items " +
          "entry per distinct commodity; don't merge multiple commodities into one entry or drop any of " +
          "them. If a field is genuinely absent or ambiguous, set its value to null and give it a low " +
          "confidence score.\n\n" +
          "--- CHAT THREAD START ---\n" +
          chatThread +
          "\n--- CHAT THREAD END ---",
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (!toolUse) {
    throw new AppError(502, "Model did not return structured extraction output");
  }

  return toolUse.input as DealExtraction;
}
