import { Router } from "express";
import { z } from "zod";
import { AppError } from "../lib/AppError.js";
import { formatFieldErrors } from "../validation/contractSchema.js";

export const whatsappOnboardingRouter = Router();

async function whatsappCloudApi() {
  return import("../whatsapp/whatsappCloudApi.js");
}

const embeddedSignupSchema = z.object({
  code: z.string({ error: "code is required" }).min(1, "code is required"),
  wabaId: z.string({ error: "wabaId is required" }).min(1, "wabaId is required"),
  phoneNumberId: z.string({ error: "phoneNumberId is required" }).min(1, "phoneNumberId is required"),
  displayPhoneNumber: z
    .string({ error: "displayPhoneNumber is required" })
    .min(1, "displayPhoneNumber is required"),
});

/** Completes Meta's Embedded Signup handshake: exchanges the short-lived `code` the
 * frontend got from the Facebook JS SDK for an access token tied to this org's own WABA,
 * then stores it so incoming webhook events for that phone_number_id route through the
 * coexistence auto-pairing flow instead of the dev/test explicit-registration flow. */
whatsappOnboardingRouter.post("/embedded-signup", async (req, res) => {
  const parsed = embeddedSignupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "Validation failed", formatFieldErrors(parsed.error));
  }

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new AppError(500, "META_APP_ID/WHATSAPP_APP_SECRET are not configured on the server");
  }

  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("code", parsed.data.code);

  const tokenRes = await fetch(tokenUrl);
  const tokenBody = (await tokenRes.json()) as { access_token?: string; error?: { message: string } };
  if (!tokenRes.ok || !tokenBody.access_token) {
    throw new AppError(502, tokenBody.error?.message ?? "Failed to exchange Embedded Signup code");
  }

  const { createConnection } = await whatsappCloudApi();
  const connection = await createConnection({
    orgId: req.orgId!,
    wabaId: parsed.data.wabaId,
    phoneNumberId: parsed.data.phoneNumberId,
    displayPhoneNumber: parsed.data.displayPhoneNumber,
    accessToken: tokenBody.access_token,
  });

  res.status(201).json({
    connected: true,
    displayPhoneNumber: connection.displayPhoneNumber,
    connectedAt: connection.connectedAt,
  });
});

whatsappOnboardingRouter.get("/connection", async (req, res) => {
  const { getConnection } = await whatsappCloudApi();
  const connection = await getConnection(req.orgId!);
  if (!connection) {
    res.json({ connected: false });
    return;
  }
  res.json({
    connected: true,
    displayPhoneNumber: connection.displayPhoneNumber,
    connectedAt: connection.connectedAt,
  });
});
