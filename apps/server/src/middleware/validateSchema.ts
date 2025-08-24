import { NextFunction, Request, Response } from "express";
import { ZodError, ZodObject } from "zod";

export const validateSchema = (schema: ZodObject<any>) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate just the body directly
      const validated = await schema.parseAsync(req.body);
      // Optionally, replace req.body with the validated/transformed data
      req.body = validated;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        console.log("error", error);
        return res.status(400).json({
          error: "Validation failed",
          details: JSON.stringify(error), // Use error.errors for cleaner output
        });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };
};
