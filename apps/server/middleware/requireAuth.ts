// middleware/requireAuth.ts
import axios from "axios";
import express from "express";
import type { AuthenticatedRequest } from "../types";

function isAuthenticated(req: express.Request): req is AuthenticatedRequest {
  const aReq = req as AuthenticatedRequest;
  const result = !!(aReq.session?.githubToken && aReq.session?.githubUser);
  return result;
}

export const requireAuth: express.RequestHandler = async (
  req: express.Request,
  res: express.Response,
  next
) => {
  // FIRST: Check for Bearer token in Authorization header and process it
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

      // Populate session with GitHub data
      req.session.githubUser = userResponse.data;
      req.session.githubToken = token;
      req.session.dbProviderType = req.headers["db-provider-type"] as
        | "postgres"
        | "agentdb";
      req.session.connectionString = req.headers["connection-string"] as string;

      // Save session explicitly to ensure it's persisted
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("❌ Failed to save session:", err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      console.log("💾 Updated session with GitHub data");
    } catch (error: any) {
      console.log("❌ GitHub API call failed");
      console.log("🚫 Error details:", {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
      });
      return res.status(401).json({ error: "Invalid GitHub token" });
    }
  }

  // SECOND: Now check if authenticated (either from Bearer token above or existing session)
  console.log("🔍 Checking authentication status");
  console.log("📊 Session data:", {
    hasGithubToken: !!req.session.githubToken,
    hasGithubUser: !!req.session.githubUser,
    githubUserLogin: req.session.githubUser?.login || "none",
    tokenLength: req.session.githubToken?.length || 0,
  });

  if (!isAuthenticated(req)) {
    console.log("❌ Authentication check failed - no valid session or token");
    return res.status(401).json({ error: "Authentication required" });
  }

  return next();
};
