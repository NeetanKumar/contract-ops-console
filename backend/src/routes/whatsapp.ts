import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/AppError.js";
import { formatFieldErrors } from "../validation/contractSchema.js";

export const whatsappRouter = Router();

async function whatsappCloudApi() {
  return import("../whatsapp/whatsappCloudApi.js");
}

whatsappRouter.get("/cloud-status", async (_req, res) => {
  const { getConfigStatus } = await whatsappCloudApi();
  res.json(getConfigStatus());
});

const createNegotiationSchema = z.object({
  ourPhone: z.string({ error: "ourPhone is required" }).min(1, "ourPhone is required"),
  counterpartyPhone: z.string({ error: "counterpartyPhone is required" }).min(1, "counterpartyPhone is required"),
  direction: z.enum(["WE_BUY", "WE_SELL"], { error: "direction must be WE_BUY or WE_SELL" }),
  label: z.string().optional(),
});

whatsappRouter.post("/negotiations", async (req, res) => {
  const parsed = createNegotiationSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "Validation failed", formatFieldErrors(parsed.error));
  }
  const { createNegotiation } = await whatsappCloudApi();
  const negotiation = await createNegotiation({ orgId: req.orgId!, ...parsed.data });
  res.status(201).json(negotiation);
});

whatsappRouter.get("/negotiations", async (req, res) => {
  const { listNegotiations } = await whatsappCloudApi();
  const negotiations = await listNegotiations(req.orgId!);
  res.json({ negotiations });
});

whatsappRouter.post("/negotiations/:id/abandon", async (req, res) => {
  const { abandonNegotiation } = await whatsappCloudApi();
  const negotiation = await abandonNegotiation(req.orgId!, req.params.id);
  res.json(negotiation);
});

whatsappRouter.get("/unmatched-messages", async (req, res) => {
  const { listUnmatchedMessages } = await whatsappCloudApi();
  const messages = await listUnmatchedMessages(req.orgId!);
  res.json({ messages });
});

const assignUnmatchedMessageSchema = z.object({
  negotiationId: z.string({ error: "negotiationId is required" }).min(1, "negotiationId is required"),
});

whatsappRouter.post("/unmatched-messages/:id/assign", async (req, res) => {
  const parsed = assignUnmatchedMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "Validation failed", formatFieldErrors(parsed.error));
  }
  const { assignUnmatchedMessage } = await whatsappCloudApi();
  await assignUnmatchedMessage(req.orgId!, req.params.id, parsed.data.negotiationId);
  res.status(204).send();
});
