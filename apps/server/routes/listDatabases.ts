import express from "express";
import { getDatabaseProviderFromAuthenticatedRequest } from "../lib/db-connection";
import { requireAuth } from "../middleware/requireAuth";
import { validateSession } from "../middleware/validateSession";
import { AuthenticatedRequest } from "../types";

const router = express.Router();

// List databases
router.get(
  "/api/agentdb/databases",
  requireAuth,
  validateSession,
  async (req, res) => {
    try {
      const service = await getDatabaseProviderFromAuthenticatedRequest(
        req as AuthenticatedRequest
      );

      const token = process.env.AGENTDB_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "AgentDB token not configured" });
      }

      const databases = await service.listDatabases();
      return res.json(databases);
    } catch (error) {
      console.error("AgentDB list databases error:", error);
      return res.status(500).json({ error: "Failed to list databases" });
    }
  }
);
