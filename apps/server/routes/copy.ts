import { Router } from "express";
import { getUserDbName } from "../lib/getUserDbName";
import { requireAuth } from "../middleware/requireAuth";
import { AuthenticatedRequest } from "../types";
import { getDatabaseProviderFromAuthenticatedRequest } from "../lib/db-connection";
import z from "zod";
import { validateSession } from "middleware/validateSession";
import { validateSchema } from "middleware/validateSchema";

const router = Router();

const copySchema = z.object({
    sourceDbName: z.string(),
    targetDbName: z.string()
});

// Copy database (for template application)
router.post(
    "/api/agentdb/copy-database",
    requireAuth,
    validateSession,
    validateSchema(copySchema),
    async (req, res) => {
        const aReq = req as AuthenticatedRequest;
        try {
            const provider = await getDatabaseProviderFromAuthenticatedRequest(aReq);

            const { sourceDbName, sourceDbType = "sqlite", targetDbName } = aReq.body;

            // Use provided target name or calculate from user
            const userDbName = targetDbName || getUserDbName(aReq.session.githubUser!);

            if (!sourceDbName) {
                return res
                    .status(400)
                    .json({ error: "Source database name is required" });
            }

            // Ensure the target database name matches the user's expected database
            const expectedDbName = getUserDbName(aReq.session.githubUser!);
            if (userDbName !== expectedDbName) {
                return res
                    .status(403)
                    .json({ error: "Access denied to create this database" });
            }

            const result = await provider.copyDatabase(
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
    });

export default router;
