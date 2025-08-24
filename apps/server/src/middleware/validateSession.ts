// middleware/validateSession.ts
import { RequestHandler } from "express";
import { AuthenticatedRequestSchema } from "../types";

export const validateSession: RequestHandler = (req, res, next) => {
  console.log("req.session", req.session);

  const parsed = AuthenticatedRequestSchema.shape.session.safeParse(
    req.session
  );

  console.log("parsed", parsed);

  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid session",
      details: parsed.error.flatten(),
    });
  }

  Object.assign(req.session, parsed.data);

  return next();
};
