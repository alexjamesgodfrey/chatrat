import { DatabaseService } from "@agentdb/sdk";
import { Router } from "express";
import { getUserDbName } from "../lib/getUserDbName";
import { requireAuth } from "../middleware/requireAuth";
import { AuthenticatedRequest } from "../types";

const router = Router();

// AgentDB service instance - this will be injected
let agentDbService: DatabaseService | undefined;

export function setAgentDbService(service: DatabaseService) {
  agentDbService = service;
}

// Connect to database
router.post("/api/agentdb/connect", requireAuth, async (req, res) => {
  const aReq = req as AuthenticatedRequest;
  try {
    if (!agentDbService) {
      return res.status(500).json({ error: "AgentDB service not initialized" });
    }

    const token = process.env.AGENTDB_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "AgentDB token not configured" });
    }

    const { dbName, dbType = "sqlite" } = req.body;
    const targetDbName = dbName || getUserDbName(req.session.githubUser!);

    // For security, ensure users can only access their own databases
    const userDbName = getUserDbName(req.session.githubUser!);
    if (targetDbName !== userDbName) {
      return res.status(403).json({ error: "Access denied to this database" });
    }

    const connection = agentDbService.connect(token, targetDbName, dbType);

    // Store connection info in session for later use
    req.session.agentDbConnection = {
      dbName: targetDbName,
      dbType,
    };

    return res.json({
      success: true,
      dbName: targetDbName,
      message: "Connected to database",
    });
  } catch (error) {
    console.error("AgentDB connect error:", error);
    return res.status(500).json({ error: "Failed to connect to database" });
  }
});

export default router;
