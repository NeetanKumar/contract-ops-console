import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { contractSchema, formatFieldErrors } from "../validation/contractSchema.js";
import { AppError } from "../lib/AppError.js";
import * as contractService from "../services/contractService.js";
import { uploadAttachment, getAttachmentStream } from "../lib/attachmentStorage.js";

export const contractsRouter = Router();

// Ownership must be checked BEFORE multer touches disk — otherwise org B could
// write a file to org A's contract id just by guessing/knowing the UUID.
async function verifyContractOwnership(
  req: Request<{ id: string }>,
  _res: Response,
  next: NextFunction,
) {
  await contractService.getContract(req.orgId!, req.params.id);
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      cb(new Error("Only PDF files are allowed"));
      return;
    }
    cb(null, true);
  },
});

function uploadPdf(req: Request<{ id: string }>, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err) {
      next(new AppError(400, err instanceof Error ? err.message : "Upload failed"));
      return;
    }
    if (!req.file) {
      next(new AppError(400, "No file provided (expected multipart field 'file')"));
      return;
    }
    next();
  });
}

contractsRouter.post("/", async (req, res) => {
  const parsed = contractSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "Validation failed", formatFieldErrors(parsed.error));
  }
  const contract = await contractService.createContract(req.orgId!, parsed.data);
  res.status(201).json(contract);
});

contractsRouter.get("/", async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20));

  const result = await contractService.listContracts(req.orgId!, {
    status: req.query.status ? String(req.query.status) : undefined,
    clientName: req.query.client_name ? String(req.query.client_name) : undefined,
    contractId: req.query.contract_id ? String(req.query.contract_id) : undefined,
    page,
    limit,
  });

  res.json(result);
});

contractsRouter.get("/:id/events", async (req, res) => {
  const events = await contractService.getContractEvents(req.orgId!, req.params.id);
  res.json({ events });
});

contractsRouter.get("/:id", async (req, res) => {
  const contract = await contractService.getContract(req.orgId!, req.params.id);
  res.json(contract);
});

contractsRouter.put("/:id", async (req, res) => {
  const parsed = contractSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, "Validation failed", formatFieldErrors(parsed.error));
  }
  const contract = await contractService.updateContract(req.orgId!, req.params.id, parsed.data);
  res.json(contract);
});

contractsRouter.post("/:id/finalize", async (req, res) => {
  const contract = await contractService.finalizeContract(req.orgId!, req.params.id);
  res.json(contract);
});

contractsRouter.post("/:id/archive", async (req, res) => {
  const contract = await contractService.archiveContract(req.orgId!, req.params.id);
  res.json(contract);
});

contractsRouter.delete("/:id", async (req, res) => {
  await contractService.deleteContract(req.orgId!, req.params.id);
  res.status(204).end();
});

contractsRouter.post("/:id/attachment", verifyContractOwnership, uploadPdf, async (req, res) => {
  await uploadAttachment(req.params.id, req.file!.buffer, req.file!.mimetype);
  const contract = await contractService.saveAttachment(req.orgId!, req.params.id, req.file!);
  res.status(201).json(contract);
});

contractsRouter.get("/:id/attachment", async (req, res) => {
  const contract = await contractService.getContract(req.orgId!, req.params.id);
  if (!contract.attachmentFilename) {
    throw new AppError(404, "No attachment for this contract");
  }
  res.setHeader("Content-Type", contract.attachmentMimeType ?? "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${contract.attachmentFilename}"`);
  const stream = await getAttachmentStream(contract.id);
  stream.pipe(res);
});

contractsRouter.delete("/:id/attachment", async (req, res) => {
  await contractService.deleteAttachment(req.orgId!, req.params.id);
  res.status(204).end();
});
