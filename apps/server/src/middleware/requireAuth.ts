// middleware/requireAuth.ts
import axios from "axios";
import type { Response } from "express";
import { Request, RequestHandler } from "express";
import type { AuthenticatedRequest } from "../types";

function isAuthenticated(req: Request): req is AuthenticatedRequest {
  return !!(req.session?.githubToken && req.session?.githubUser);
}

export const requireAuth: RequestHandler = async (req, res: Response, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);

    try {
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      req.session.githubUser = userResponse.data;
      req.session.githubToken = token;

      return next();
    } catch {
      return res.status(401).json({ error: "Invalid GitHub token" });
    }
  }

  if (!req.session.githubToken || !req.session.githubUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Final runtime assert (useful if other fields matter)
  if (!isAuthenticated(req)) {
    return res.status(401).json({ error: "Authentication required" });
  }

  return next();
};
