// middleware/requireAuth.ts
import axios from "axios";
import type { Response } from "express";
import { Request, RequestHandler } from "express";
import type { AuthenticatedRequest } from "../types";

function isAuthenticated(req: Request): req is AuthenticatedRequest {
  const aReq = req as AuthenticatedRequest;
  const result = !!(aReq.session?.githubToken && aReq.session?.githubUser);
  console.log("🔍 isAuthenticated check:", {
    hasSession: !!aReq.session,
    hasGithubToken: !!aReq.session?.githubToken,
    hasGithubUser: !!aReq.session?.githubUser,
    result,
  });
  return result;
}

export const requireAuth: RequestHandler = async (req, res: Response, next) => {
  console.log("🚪 requireAuth middleware started");
  console.log("📋 Initial request details:", {
    method: req.method,
    url: req.url,
    hasSession: !!req.session,
    sessionId: req.session?.id || "none",
    hasAuthHeader: !!req.headers.authorization,
  });

  // FIRST: Check for Bearer token in Authorization header and process it
  const authHeader = req.headers.authorization;
  console.log(
    "📨 Authorization header:",
    authHeader ? `${authHeader.substring(0, 20)}...` : "none"
  );

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    console.log("🎫 Found Bearer token, length:", token.length);
    console.log("🌐 Making GitHub API call to validate token...");

    try {
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      console.log("✅ GitHub API call successful");
      console.log("👤 GitHub user data:", {
        login: userResponse.data.login,
        id: userResponse.data.id,
        name: userResponse.data.name,
        email: userResponse.data.email,
      });

      // Populate session with GitHub data
      req.session.githubUser = userResponse.data;
      req.session.githubToken = token;

      // Save session explicitly to ensure it's persisted
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("❌ Failed to save session:", err);
            reject(err);
          } else {
            console.log("💾 Session saved successfully");
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

  console.log("🎉 Authentication successful - proceeding to next middleware");
  return next();
};
