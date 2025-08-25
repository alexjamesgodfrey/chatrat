import { z } from "zod";
import type { ExecuteResult } from "@agentdb/sdk";

// /v1/execute-sql
export const SqlStatement = z.object({
  sql: z.string(),
  params: z.array(z.any()).optional().default([]),
});
export type SqlStatement = z.infer<typeof SqlStatement>;
export const executeSqlSchema = z.object({
  statements: z.array(SqlStatement).max(100),
});
export type ExecuteSqlSchema = z.infer<typeof executeSqlSchema>;
export type SqlResults = ExecuteResult;

export interface AgentDBTemplate {
  name: string;
  description: string;
  migrations: string[];
}
