import { config } from "dotenv";
config({ path: ".env.test" });

import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";

beforeEach(async () => {
  await prisma.contractEvent.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.organisation.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
