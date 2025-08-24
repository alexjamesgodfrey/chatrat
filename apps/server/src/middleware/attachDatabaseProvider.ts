import { NextFunction, Response, Request } from "express";
import { getDatabaseProviderFromAuthenticatedRequest } from "src/lib/db-connection";
import { AuthenticatedRequest, RequestWithProvider } from "src/types";

export const attachDatabaseProvider = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const aReq = req as AuthenticatedRequest;
    try {
      const provider = await getDatabaseProviderFromAuthenticatedRequest(aReq);
      (req as RequestWithProvider).dbProvider = provider;
    } catch (error) {
      console.error("Failed to attach database provider:", error);
      res.status(500).json({
        success: false,
        message: "Failed to initialize database connection",
      });
    }
    next();
  } catch (error) {
    console.error("Failed to attach database provider:", error);
    res.status(500).json({
      success: false,
      message: "Failed to initialize database connection",
    });
  }
};
