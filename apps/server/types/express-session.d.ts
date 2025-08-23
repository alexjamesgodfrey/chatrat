// types/express-session.d.ts
import "express-session";
import type {
  AgentDbConnectionConfig,
  dbProviderType,
  GitHubUser,
  PostgresConnection,
} from "../types";

declare module "express-session" {
  interface SessionData {
    githubToken?: string;
    githubUser?: GitHubUser;
    dbProviderType?: (typeof dbProviderType)[number];
    agentDbConnection?: AgentDbConnectionConfig;
    postgresConnection?: PostgresConnection;
  }
}
