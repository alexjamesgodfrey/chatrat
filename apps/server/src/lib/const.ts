import dotenv from "dotenv";

dotenv.config();

export const AGENTDB_BASE_URL =
  process.env.AGENTDB_BASE_URL || "https://api.agentdb.com/";

export const AGENTDB_CLIENT_DEBUG =
  process.env.AGENTDB_CLIENT_DEBUG == "true" || true;

export const DEFAULT_AGENTDB_DB_API_KEY =
  process.env.DEFAULT_AGENTDB_DB_API_KEY!;

if (!DEFAULT_AGENTDB_DB_API_KEY) {
  throw new Error("DEFAULT_AGENTDB_DB_API_KEY is not set");
}

export const DEFAULT_AGENTDB_TOKEN = process.env.DEFAULT_AGENTDB_TOKEN!;

if (!DEFAULT_AGENTDB_TOKEN) {
  throw new Error("DEFAULT_AGENTDB_TOKEN is not set");
}

export const CHATRAT_TEMPLATE_NAME =
  process.env.CHATRAT_TEMPLATE_NAME || "chatrat-template";
