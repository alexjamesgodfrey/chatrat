// Create MCP slug
app.post(
  "/api/agentdb/create-mcp-slug",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!agentDbService) {
        return res
          .status(500)
          .json({ error: "AgentDB service not initialized" });
      }

      const token = process.env.AGENTDB_TOKEN;
      const apiKey = process.env.AGENTDB_API_KEY;

      if (!token || !apiKey) {
        return res
          .status(500)
          .json({ error: "AgentDB credentials not configured" });
      }

      const userDbName = getUserDbName(req.session.githubUser!);

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
  }
);
