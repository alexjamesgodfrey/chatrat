
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { validateSession } from "../middleware/validateSession";
import { RequestWithProvider } from "../types";
import { attachDatabaseProvider } from "../middleware/attachDatabaseProvider";

const router = Router();

router.post(
  "/v1/check-or-seed",
  requireAuth,
  validateSession,
  attachDatabaseProvider,
  async (req, res) => {
    const { dbProvider } = req as RequestWithProvider;

    console.log("dbProvider", dbProvider);

    try {
      await dbProvider.seedDatabaseIfNecessary();
      console.log("seeded");
      return res.json({
        success: true,
        message: "Database checked or seeded successfully",
      });
    } catch (error) {
      console.error("error", error);
      return res.status(500).json({
        success: false,
        message: "Failed to seed database",
      });
    }
  }
);

export default router;
