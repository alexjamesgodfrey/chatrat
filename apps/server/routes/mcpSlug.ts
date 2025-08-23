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

// Create MCP slug
router.post("/api/agentdb/create-mcp-slug", requireAuth, async (req, res) => {
  const aReq = req as AuthenticatedRequest;
  try {
    if (!agentDbService) {
      return res.status(500).json({ error: "AgentDB service not initialized" });
    }

    const token = process.env.AGENTDB_TOKEN;
    const apiKey = process.env.AGENTDB_API_KEY;

    if (!token || !apiKey) {
      return res
        .status(500)
        .json({ error: "AgentDB credentials not configured" });
    }

    const userDbName = getUserDbName(aReq.session.githubUser!);

    const result = await agentDbService.createMcpSlug({
      key: apiKey,
      token,
      dbType: "sqlite",
      dbName: userDbName,
      template: "repo-context-template-real",
    });

    return res.json(result);
  } catch (error) {
    console.error("AgentDB create MCP slug error:", error);
    return res.status(500).json({ error: "Failed to create MCP slug" });
  }
});

export default router;
