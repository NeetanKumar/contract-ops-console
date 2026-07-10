import { Router } from "express";
import { contractSchema, formatFieldErrors } from "../validation/contractSchema.js";
import { AppError } from "../lib/AppError.js";
import * as contractService from "../services/contractService.js";

export const contractsRouter = Router();

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
