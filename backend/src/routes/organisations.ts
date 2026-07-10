import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/AppError.js";
import { registerConnection } from "../sse/sseManager.js";

export const organisationsRouter = Router();

organisationsRouter.get("/", async (_req, res) => {
  const organisations = await prisma.organisation.findMany({ orderBy: { name: "asc" } });
  res.json({ organisations });
});

organisationsRouter.get("/:orgId/events/stream", async (req, res) => {
  const org = await prisma.organisation.findUnique({ where: { id: req.params.orgId } });
  if (!org) {
    throw new AppError(404, "Organisation not found");
  }
  registerConnection(req.params.orgId, res);
});
