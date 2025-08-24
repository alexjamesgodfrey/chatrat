// types/express-session.d.ts
import "express-session";
import type { dbProviderType, GitHubUser } from ".";

declare module "express-session" {
  interface SessionData {
    githubToken?: string;
    githubUser?: GitHubUser;
    dbProviderType?: (typeof dbProviderType)[number];
    connectionString?: string;
  }
}
