import { z } from "zod";

// /api/execute
export const SqlStatement = z.object({
  sql: z.string(),
  params: z.array(z.any()).optional().default([]),
});
export type SqlStatement = z.infer<typeof SqlStatement>;
export const executeSqlSchema = z.object({
  statements: z.array(SqlStatement).max(100),
});
export type ExecuteSqlSchema = z.infer<typeof executeSqlSchema>;
