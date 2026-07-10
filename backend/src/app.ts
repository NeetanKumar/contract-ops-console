import express from "express";
import cors from "cors";
import { organisationsRouter } from "./routes/organisations.js";
import { contractsRouter } from "./routes/contracts.js";
import { orgScope } from "./middleware/orgScope.js";
import { errorHandler } from "./middleware/errorHandler.js";

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/organisations", organisationsRouter);
  app.use("/api/contracts", orgScope, contractsRouter);

  app.use(errorHandler);

  return app;
}
