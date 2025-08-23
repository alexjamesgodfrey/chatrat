// Copy database (for template application)
app.post(
  "/api/agentdb/copy-database",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!agentDbService) {
        return res
          .status(500)
          .json({ error: "AgentDB service not initialized" });
      }

      const token = process.env.AGENTDB_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "AgentDB token not configured" });
      }

      const { sourceDbName, sourceDbType = "sqlite", targetDbName } = req.body;

      // Use provided target name or calculate from user
      const userDbName = targetDbName || getUserDbName(req.session.githubUser!);

      if (!sourceDbName) {
        return res
          .status(400)
          .json({ error: "Source database name is required" });
      }

      // Ensure the target database name matches the user's expected database
      const expectedDbName = getUserDbName(req.session.githubUser!);
      if (userDbName !== expectedDbName) {
        return res
          .status(403)
          .json({ error: "Access denied to create this database" });
      }

      const result = await agentDbService.copyDatabase(
        token,
        sourceDbName,
        sourceDbType,
        token,
        userDbName
      );

      return res.json(result);
    } catch (error) {
      console.error("AgentDB copy database error:", error);
      return res.status(500).json({ error: "Failed to copy database" });
    }
  }
);
