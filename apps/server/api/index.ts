import { DatabaseService } from "@agentdb/sdk";
import { Redis } from "@upstash/redis";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import path from "path";

// Import route modules
import agentdbExecuteRouter, {
  setAgentDbService as setAgentDbServiceExecute,
} from "../routes/agentdbExecute";
import connectRouter, {
  setAgentDbService as setAgentDbServiceConnect,
} from "../routes/connect";
import copyRouter, {
  setAgentDbService as setAgentDbServiceCopy,
} from "../routes/copy";
import executeSqlRouter from "../routes/executeSql";
import healthRouter, {
  setAgentDbService as setAgentDbServiceHealth,
} from "../routes/health";
import mcpSlugRouter, {
  setAgentDbService as setAgentDbServiceMcp,
} from "../routes/mcpSlug";

// Load environment variables
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: [
      "vscode-webview://*",
      "https://*.chatrat.cat",
      "https://chatrat.cat",
      "http://localhost:*",
    ],
    credentials: true,
  })
);

// Custom Upstash Redis Session Store
class UpstashRedisStore extends (session.Store as any) {
  private client: Redis;
  private prefix: string;
  private ttl: number;

  constructor(options: { client: Redis; prefix?: string; ttl?: number }) {
    super();
    this.client = options.client;
    this.prefix = options.prefix || "sess:";
    this.ttl = options.ttl || 86400; // 24 hours default
  }

  async get(sid: string, callback: (err: any, session?: any) => void) {
    try {
      const key = this.prefix + sid;
      const data = await this.client.get(key);

      if (!data) {
        return callback(null, null);
      }

      const session = typeof data === "string" ? JSON.parse(data) : data;
      callback(null, session);
    } catch (err) {
      console.error("Session get error:", err);
      callback(err);
    }
  }

  async set(sid: string, session: any, callback: (err?: any) => void) {
    try {
      const key = this.prefix + sid;
      const ttl = this.getTTL(session);

      await this.client.set(key, JSON.stringify(session), {
        ex: ttl,
      });

      callback(null);
    } catch (err) {
      console.error("Session set error:", err);
      callback(err);
    }
  }

  async destroy(sid: string, callback: (err?: any) => void) {
    try {
      const key = this.prefix + sid;
      await this.client.del(key);
      callback(null);
    } catch (err) {
      console.error("Session destroy error:", err);
      callback(err);
    }
  }

  async touch(sid: string, session: any, callback: (err?: any) => void) {
    try {
      const key = this.prefix + sid;
      const ttl = this.getTTL(session);

      await this.client.expire(key, ttl);
      callback(null);
    } catch (err) {
      console.error("Session touch error:", err);
      callback(err);
    }
  }

  private getTTL(session: any): number {
    if (session && session.cookie && session.cookie.maxAge) {
      return Math.floor(session.cookie.maxAge / 1000);
    }
    return this.ttl;
  }
}

// Serve static files from /public
app.use(express.static(path.join(__dirname, "..", "public")));

// Types

// AgentDB service instance
let agentDbService: DatabaseService | undefined;

// Initialize AgentDB service
function initializeAgentDB() {
  const apiKey = process.env.AGENTDB_API_KEY;
  const baseUrl = process.env.AGENTDB_BASE_URL || "https://api.agentdb.dev";

  if (!apiKey) {
    console.error("AGENTDB_API_KEY not configured");
    return;
  }

  agentDbService = new DatabaseService(baseUrl, apiKey);
  console.log("AgentDB service initialized");

  // Inject the service into route modules
  if (agentDbService) {
    setAgentDbServiceExecute(agentDbService);
    setAgentDbServiceConnect(agentDbService);
    setAgentDbServiceCopy(agentDbService);
    setAgentDbServiceHealth(agentDbService);
    setAgentDbServiceMcp(agentDbService);
  }
}

// Initialize on startup
initializeAgentDB();

// Initialize session middleware
function initializeSession() {
  const sessionConfig: session.SessionOptions = {
    secret:
      process.env.SESSION_SECRET || "fallback-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
    },
    name: "chatrat.sid", // Custom session cookie name
  };

  // Use Upstash Redis if configured
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });

      const store = new UpstashRedisStore({
        client: redis,
        prefix: "chatrat:",
        ttl: 86400, // 24 hours
      });

      sessionConfig.store = store as any;
      console.log("Using Upstash Redis for session storage");
    } catch (error) {
      console.error("Failed to initialize Upstash Redis:", error);
      console.log("Falling back to in-memory session storage");
    }
  } else {
    console.warn(
      "UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN not configured"
    );
    console.log(
      "Using in-memory session storage (not suitable for production)"
    );
  }

  app.use(session(sessionConfig));
}

// Initialize session before routes
initializeSession();

// Use route modules
app.use(agentdbExecuteRouter);
app.use(connectRouter);
app.use(copyRouter);
app.use(executeSqlRouter);
app.use(healthRouter);
app.use(mcpSlugRouter);

// Error handling middleware
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start server
const PORT = process.env.PORT || 3000;

// For Vercel, we export the app
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Environment check:");
    console.log(
      "- GitHub OAuth:",
      !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET)
    );
    console.log(
      "- AgentDB Config:",
      !!(process.env.AGENTDB_TOKEN && process.env.AGENTDB_API_KEY)
    );
    console.log("- Session Secret:", !!process.env.SESSION_SECRET);
    console.log(
      "- Upstash Redis:",
      !!(
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
      )
    );
  });
}

export default app;
