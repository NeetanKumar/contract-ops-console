import fs from "node:fs";
import path from "node:path";
import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";
import { organisationsRouter } from "./routes/organisations.js";
import { contractsRouter } from "./routes/contracts.js";
import { orgScope } from "./middleware/orgScope.js";
import { errorHandler } from "./middleware/errorHandler.js";

const OPENAPI_PATH = path.resolve(process.cwd(), "openapi.yaml");

export function createApp() {
  const app = express();

  const allowedOrigins = (process.env.CORS_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  app.use(cors({ origin: allowedOrigins.length > 0 ? allowedOrigins : true }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  const openapiDocument = YAML.parse(fs.readFileSync(OPENAPI_PATH, "utf-8"));
  app.get("/openapi.yaml", (_req, res) => {
    res.type("application/yaml").send(fs.readFileSync(OPENAPI_PATH, "utf-8"));
  });
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));

  app.use("/api/organisations", organisationsRouter);
  app.use("/api/contracts", orgScope, contractsRouter);

  app.use(errorHandler);

  return app;
}
