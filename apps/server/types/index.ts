import { Request } from "express";
import z from "zod";

export const dbProviderType = ["postgres", "agentdb"] as const;

const GitHubUser = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string(),
  email: z.string(),
});
export type GitHubUser = z.infer<typeof GitHubUser>;

const AgentDbConnectionConfig = z.object({
  dbName: z.string(),
  token: z.string().optional(),
  apiKey: z.string().optional(),
});
export type AgentDbConnectionConfig = z.infer<typeof AgentDbConnectionConfig>;

const PostgresConnection = z.object({
  connectionString: z.string(),
});
export type PostgresConnection = z.infer<typeof PostgresConnection>;

export const AuthenticatedRequestSchema = z.object({
  session: z.object({
    githubToken: z.string(),
    githubUser: GitHubUser,
    dbProviderType: z.enum(dbProviderType),
    agentDbConnection: AgentDbConnectionConfig.optional(),
    postgresConnection: PostgresConnection.optional(),
  }),
});

export type AuthenticatedSession = z.infer<typeof AuthenticatedRequestSchema>;

export type AuthenticatedRequest = Request & AuthenticatedSession;

export const SqlStatement = z.object({
  sql: z.string(),
  params: z.array(z.string()).optional().default([]),
});
export type SqlStatement = z.infer<typeof SqlStatement>;

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
