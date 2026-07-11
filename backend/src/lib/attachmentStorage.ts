import { mkdirSync } from "node:fs";
import path from "node:path";

// Overridable so the test suite can point this at a throwaway directory
// instead of writing real files into the dev/prod uploads folder.
export const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(process.cwd(), "uploads");
mkdirSync(UPLOADS_DIR, { recursive: true });

export function attachmentPath(contractId: string): string {
  return path.join(UPLOADS_DIR, `${contractId}.pdf`);
}
