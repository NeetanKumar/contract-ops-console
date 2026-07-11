import { config } from "dotenv";
config({ path: ".env.test" });

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Must be set before anything imports attachmentStorage.ts, so uploaded test
// PDFs never land in the real dev uploads/ directory.
const testUploadsDir = mkdtempSync(path.join(tmpdir(), "contract-ops-uploads-"));
process.env.UPLOADS_DIR = testUploadsDir;

import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";

beforeEach(async () => {
  await prisma.contractEvent.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.organisation.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
  rmSync(testUploadsDir, { recursive: true, force: true });
});
