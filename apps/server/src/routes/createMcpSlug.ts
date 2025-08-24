import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { RequestWithProvider } from "../types";
import { validateSession } from "src/middleware/validateSession";
import { attachDatabaseProvider } from "src/middleware/attachDatabaseProvider";

const router = Router();

// Create MCP slug
router.post(
  "/api/agentdb/create-mcp-slug",
  requireAuth,
  validateSession,
  attachDatabaseProvider,
  async (req, res) => {
    const { dbProvider } = req as RequestWithProvider;

    try {
      const slug = await dbProvider.createMcpSlug();
      return res.json({ slug });
    } catch (error) {
      return res.status(500).json({ error: "Failed to create MCP slug" });
    }
  }
);

export default router;
