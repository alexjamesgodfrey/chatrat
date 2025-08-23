import { Router } from "express";
import z from "zod";
import { getDatabaseProviderFromAuthenticatedRequest } from "../lib/db-connection";
import { getUserDbName } from "../lib/getUserDbName";
import { requireAuth } from "../middleware/requireAuth";
import { validateSchema } from "../middleware/validateSchema";
import { validateSession } from "../middleware/validateSession";
import { AuthenticatedRequest, SqlStatement } from "../types";

const router = Router();

const executeSqlSchema = z.object({
  statements: z.array(SqlStatement),
});

router.post(
  "/api/execute",
  requireAuth,
  validateSession,
  validateSchema(executeSqlSchema),
  async (req, res) => {
    const aReq = req as AuthenticatedRequest;

    const { session } = aReq;
    const { statements } = aReq.body as { statements: SqlStatement[] };
    const provider = await getDatabaseProviderFromAuthenticatedRequest(aReq);

    await provider.executeSql(statements);

    const userDbName = getUserDbName(req.session.githubUser!);

    res.send("Hello World!");
  }
);

export default router;
