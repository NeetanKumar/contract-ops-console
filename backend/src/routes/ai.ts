import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/AppError.js";
import { formatFieldErrors } from "../validation/contractSchema.js";
import { extractDealTerms } from "../services/dealExtractionService.js";

export const aiRouter = Router();

const extractPreviewSchema = z.object({
  thread: z.string({ error: "thread is required" }).min(1, "thread is required"),
});

aiRouter.post("/extract-preview", async (req, res) => {
  const parsed = extractPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "Validation failed", formatFieldErrors(parsed.error));
  }

  const extraction = await extractDealTerms(parsed.data.thread);
  res.json({ extraction });
});
