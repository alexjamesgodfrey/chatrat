import { SqlStatement } from "@chatrat/types";
import { Request } from "express";
import z from "zod";

export const dbProviderType = ["postgres", "agentdb"] as const;
export interface DatabaseProvider {
  executeSql(statements: SqlStatement[]): Promise<void>;
  seedDatabaseIfNecessary(): Promise<void>;
}

const GitHubUser = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string(),
  email: z.string(),
});
export type GitHubUser = z.infer<typeof GitHubUser>;

export const AuthenticatedRequestSchema = z.object({
  session: z.object({
    githubToken: z.string(),
    githubUser: GitHubUser,
    dbProviderType: z.enum(dbProviderType),
    connectionString: z.string().optional(),
  }),
});

export type AuthenticatedSession = z.infer<typeof AuthenticatedRequestSchema>;

export type AuthenticatedRequest = Request & AuthenticatedSession;

export type RequestWithProvider = AuthenticatedRequest & {
  dbProvider: DatabaseProvider;
};

// export interface AuthenticatedRequest extends Request {
//   session: session.Session & {
//     githubToken?: string;
//     githubUser?: {
//       id: number;
//       login: string;
//       name: string;
//       email: string;
//     };
//     oauthState?: string;
//     dbProviderType: (typeof dbProviderType)[number];
//     agentDbConnection?: {
//       dbName: string;
//       dbType: string;
//       token?: string;
//       apiKey?: string;
//     };
//     postgresConnection?: {};
//   };
// }
