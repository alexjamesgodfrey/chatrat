import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validateSchema } from "../middleware/validateSchema";
import { validateSession } from "../middleware/validateSession";
import { RequestWithProvider } from "../types";
import { executeSqlSchema } from "@chatrat/types";
import { attachDatabaseProvider } from "src/middleware/attachDatabaseProvider";

const router = Router();

router.post(
  "/api/execute-sql",
  requireAuth,
  validateSession,
  attachDatabaseProvider,
  validateSchema(executeSqlSchema),
  async (req, res) => {
    const {
      dbProvider,
      body: { statements },
    } = req as RequestWithProvider;

    try {
      await dbProvider.executeSql(statements);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to execute SQL statements",
      });
      return;
    }

    res.json({
      success: true,
      message: "SQL statements executed successfully",
    });
  }
);

export default router;
