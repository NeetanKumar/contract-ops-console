import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/AppError.js";
import { isValidUUID } from "../lib/validation.js";

// Orgs essentially never change once seeded, so a short TTL cache avoids a DB round-trip
// on every single request. Cost of a stale entry is minor (an org deleted in the last few
// seconds stays "valid" briefly) and this app has no org-deletion feature anyway.
const CACHE_TTL_MS = 60_000;
const validOrgCache = new Map<string, number>();

function isCachedValid(orgId: string): boolean {
  const expiresAt = validOrgCache.get(orgId);
  if (expiresAt === undefined) return false;
  if (expiresAt < Date.now()) {
    validOrgCache.delete(orgId);
    return false;
  }
  return true;
}

/**
 * Every /api/contracts* request must carry a valid X-Org-Id (header or ?org_id= query
 * param). We never trust it blindly: it's checked against the organisations table here,
 * and every downstream query still filters by req.orgId explicitly.
 */
export async function orgScope(req: Request, _res: Response, next: NextFunction) {
  const orgId = (req.header("X-Org-Id") ?? req.query.org_id) as string | undefined;

  if (!orgId || !isValidUUID(orgId)) {
    next(new AppError(400, "A valid X-Org-Id header (or org_id query param) is required"));
    return;
  }

  if (!isCachedValid(orgId)) {
    const org = await prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) {
      next(new AppError(400, "Unknown organisation"));
      return;
    }
    validOrgCache.set(orgId, Date.now() + CACHE_TTL_MS);
  }

  req.orgId = orgId;
  next();
}
