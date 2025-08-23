import { NextFunction, Request, Response } from "express";
import { ZodError, ZodObject } from "zod";

export const validateSchema = (schema: ZodObject) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({,
          error: "Validation failed",
          details: JSON.stringify(error),
        });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };
};
