import { Router } from "express";
import { getDatabaseProviderFromAuthenticatedRequest } from "../lib/db-connection";
import { requireAuth } from "../middleware/requireAuth";
import { validateSchema } from "../middleware/validateSchema";
import { validateSession } from "../middleware/validateSession";
import { AuthenticatedRequest } from "../types";
import { executeSqlSchema, SqlStatement } from "@chatrat/types";

const router = Router();

router.post(
  "/api/execute",
  requireAuth,
  validateSession,
  validateSchema(executeSqlSchema),
  async (req, res) => {
    const aReq = req as AuthenticatedRequest;

    const { statements } = aReq.body as { statements: SqlStatement[] };
    const provider = await getDatabaseProviderFromAuthenticatedRequest(aReq);

    await provider.executeSql(statements);

    res.json({
      success: true,
      message: "SQL statements executed successfully",
    });
  }
);

export default router;
