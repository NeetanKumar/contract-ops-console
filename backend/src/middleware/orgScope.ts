import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/AppError.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every /api/contracts* request must carry a valid X-Org-Id (header or ?org_id= query
 * param). We never trust it blindly: it's checked against the organisations table here,
 * and every downstream query still filters by req.orgId explicitly.
 */
export async function orgScope(req: Request, _res: Response, next: NextFunction) {
  const orgId = (req.header("X-Org-Id") ?? req.query.org_id) as string | undefined;

  if (!orgId || !UUID_PATTERN.test(orgId)) {
    next(new AppError(400, "A valid X-Org-Id header (or org_id query param) is required"));
    return;
  }

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org) {
    next(new AppError(400, "Unknown organisation"));
    return;
  }

  req.orgId = orgId;
  next();
}
