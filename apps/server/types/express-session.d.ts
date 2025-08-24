// types/express-session.d.ts
import "express-session";
import type { Session } from "express-session";
import type { dbProviderType, GitHubUser } from ".";

declare module "express-session" {
  interface SessionData {
    githubToken?: string;
    githubUser?: GitHubUser;
    dbProviderType?: (typeof dbProviderType)[number];
    connectionString?: string;
  }
}

declare module "express-serve-static-core" {
  interface Request {
    session: Session & Partial<SessionData>;
  }
}
