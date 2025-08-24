import express, { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validateSchema } from "../middleware/validateSchema";
import { validateSession } from "../middleware/validateSession";
import { RequestWithProvider } from "../types";
import { executeSqlSchema } from "@chatrat/types/src/index";
import { attachDatabaseProvider } from "middleware/attachDatabaseProvider";

const router = Router();

router.post(
  "/api/execute-sql",
  requireAuth,
  validateSession,
  attachDatabaseProvider,
  validateSchema(executeSqlSchema),
  async (req: express.Request, res: express.Response) => {
    const {
      dbProvider,
      body: { statements },
    } = req as RequestWithProvider;

    console.log("grep statemetns ", statements.length);
    try {
      const results = await dbProvider.executeSql(statements);
      console.log("results", results);
      res.json(results);
    } catch (error) {
      res.status(500).json(error);
      return;
    }
  }
);

export default router;
