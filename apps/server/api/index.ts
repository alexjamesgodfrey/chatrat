import { DatabaseService } from "@agentdb/sdk";
import { Redis } from "@upstash/redis";
import axios from "axios";
import cors from "cors";
import dotenv from "dotenv";
import express, { Request } from "express";
import session from "express-session";
import path from "path";

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
interface AuthenticatedRequest extends Request {
  session: session.Session & {
    githubToken?: string;
    githubUser?: {
      id: number;
      login: string;
      name: string;
      email: string;
    };
    oauthState?: string;
    agentDbConnection?: {
      dbName: string;
      dbType: string;
    };
  };
}

interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
}

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

// Middleware to check authentication
async function requireAuth(
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction
) {
  // Check for Bearer token (from VSCode extension)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);

    try {
      // Verify it's a valid GitHub token
      const userResponse = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      // Attach user info to request
      req.session.githubUser = userResponse.data;
      req.session.githubToken = token;
      return next();
    } catch (error) {
      return res.status(401).json({ error: "Invalid GitHub token" });
    }
  }

  // Fall back to session-based auth (for web interface)
  if (!req.session.githubToken || !req.session.githubUser) {
    return res.status(401).json({ error: "Authentication required" });
  }

  return next();
}

// AgentDB Proxy Endpoints
// Helper function to get user-specific database name
function getUserDbName(githubUser: GitHubUser): string {
  const base = "repo-context";
  const safeUser = githubUser.login.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return `${base}-${safeUser || "unknown"}`.slice(0, 32);
}

// List databases
app.get(
  "/api/agentdb/databases",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!agentDbService) {
        return res
          .status(500)
          .json({ error: "AgentDB service not initialized" });
      }

      const token = process.env.AGENTDB_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "AgentDB token not configured" });
      }

      const databases = await agentDbService.listDatabases(token);
      return res.json(databases);
    } catch (error) {
      console.error("AgentDB list databases error:", error);
      return res.status(500).json({ error: "Failed to list databases" });
    }
  }
);

// Connect to database
app.post(
  "/api/agentdb/connect",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!agentDbService) {
        return res
          .status(500)
          .json({ error: "AgentDB service not initialized" });
      }

      const token = process.env.AGENTDB_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "AgentDB token not configured" });
      }

      const { dbName, dbType = "sqlite" } = req.body;
      const targetDbName = dbName || getUserDbName(req.session.githubUser!);

      // For security, ensure users can only access their own databases
      const userDbName = getUserDbName(req.session.githubUser!);
      if (targetDbName !== userDbName) {
        return res
          .status(403)
          .json({ error: "Access denied to this database" });
      }

      const connection = agentDbService.connect(token, targetDbName, dbType);

      // Store connection info in session for later use
      req.session.agentDbConnection = {
        dbName: targetDbName,
        dbType,
      };

      return res.json({
        success: true,
        dbName: targetDbName,
        message: "Connected to database",
      });
    } catch (error) {
      console.error("AgentDB connect error:", error);
      return res.status(500).json({ error: "Failed to connect to database" });
    }
  }
);

// Execute SQL queries
app.post(
  "/api/agentdb/execute",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!agentDbService) {
        return res
          .status(500)
          .json({ error: "AgentDB service not initialized" });
      }

      const token = process.env.AGENTDB_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "AgentDB token not configured" });
      }

      const { sql, params = [] } = req.body;
      const userDbName = getUserDbName(req.session.githubUser!);

      if (!sql) {
        return res.status(400).json({ error: "SQL query is required" });
      }

      const connection = agentDbService.connect(token, userDbName, "sqlite");
      const result = await connection.execute({ sql, params });

      return res.json(result);
    } catch (error) {
      console.error("AgentDB execute error:", error);
      return res.status(500).json({ error: "Failed to execute query" });
    }
  }
);

// Natural language to SQL
app.post(
  "/api/agentdb/nl-to-sql",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!agentDbService) {
        return res
          .status(500)
          .json({ error: "AgentDB service not initialized" });
      }

      const token = process.env.AGENTDB_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "AgentDB token not configured" });
      }

      const {
        query,
        context = null,
        templateName = "repo-context-template",
      } = req.body;
      const userDbName = getUserDbName(req.session.githubUser!);

      if (!query) {
        return res
          .status(400)
          .json({ error: "Natural language query is required" });
      }

      const connection = agentDbService.connect(token, userDbName, "sqlite");
      const result = await connection.naturalLanguageToSql(
        query,
        context,
        templateName
      );

      return res.json(result);
    } catch (error) {
      console.error("AgentDB NL to SQL error:", error);
      return res
        .status(500)
        .json({ error: "Failed to process natural language query" });
    }
  }
);

// Copy database (for template application)
app.post(
  "/api/agentdb/copy-database",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!agentDbService) {
        return res
          .status(500)
          .json({ error: "AgentDB service not initialized" });
      }

      const token = process.env.AGENTDB_TOKEN;
      if (!token) {
        return res.status(500).json({ error: "AgentDB token not configured" });
      }

      const { sourceDbName, sourceDbType = "sqlite", targetDbName } = req.body;

      // Use provided target name or calculate from user
      const userDbName = targetDbName || getUserDbName(req.session.githubUser!);

      if (!sourceDbName) {
        return res
          .status(400)
          .json({ error: "Source database name is required" });
      }

      // Ensure the target database name matches the user's expected database
      const expectedDbName = getUserDbName(req.session.githubUser!);
      if (userDbName !== expectedDbName) {
        return res
          .status(403)
          .json({ error: "Access denied to create this database" });
      }

      const result = await agentDbService.copyDatabase(
        token,
        sourceDbName,
        sourceDbType,
        token,
        userDbName
      );

      return res.json(result);
    } catch (error) {
      console.error("AgentDB copy database error:", error);
      return res.status(500).json({ error: "Failed to copy database" });
    }
  }
);

// Create MCP slug
app.post(
  "/api/agentdb/create-mcp-slug",
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!agentDbService) {
        return res
          .status(500)
          .json({ error: "AgentDB service not initialized" });
      }

      const token = process.env.AGENTDB_TOKEN;
      const apiKey = process.env.AGENTDB_API_KEY;

      if (!token || !apiKey) {
        return res
          .status(500)
          .json({ error: "AgentDB credentials not configured" });
      }

      const userDbName = getUserDbName(req.session.githubUser!);

      const result = await agentDbService.createMcpSlug({
        key: apiKey,
        token,
        dbType: "sqlite",
        dbName: userDbName,
        template: "repo-context-template-real",
      });

      return res.json(result);
    } catch (error) {
      console.error("AgentDB create MCP slug error:", error);
      return res.status(500).json({ error: "Failed to create MCP slug" });
    }
  }
);

// Health check
app.get("/healthz", (req, res) => {
  const status = {
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      agentdb: !!agentDbService,
      github_oauth: !!(
        process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ),
      agentdb_config: !!(
        process.env.AGENTDB_TOKEN && process.env.AGENTDB_API_KEY
      ),
      upstash_redis: !!(
        process.env.UPSTASH_REDIS_REST_URL &&
        process.env.UPSTASH_REDIS_REST_TOKEN
      ),
    },
  };
  res.status(200).json(status);
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// 404 handler
app.use((req, res) => {
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
