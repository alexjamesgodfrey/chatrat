import DatabaseService, { DatabaseConnection } from "@agentdb/sdk";
import { Pool } from "pg";
import {
  AgentDbConnectionConfig,
  AuthenticatedRequest,
  SqlStatement,
} from "../types";
import {
  AGENTDB_BASE_URL,
  AGENTDB_CLIENT_DEBUG,
  DEFAULT_AGENTDB_DB_API_KEY,
  DEFAULT_AGENTDB_TOKEN,
} from "./const";

interface DatabaseProvider {
  executeSql(statements: SqlStatement[]): Promise<void>;
}

class AgentDBDatabase implements DatabaseProvider {
  private token: string;
  private apiKey: string;
  private dbName: string;
  private client: DatabaseService | null = null;
  private connection: DatabaseConnection | null = null;

  constructor(agentDBConnectionConfig: AgentDbConnectionConfig) {
    const {
      token = DEFAULT_AGENTDB_TOKEN,
      apiKey = DEFAULT_AGENTDB_DB_API_KEY,
      dbName,
    } = agentDBConnectionConfig;

    this.token = token;
    this.apiKey = apiKey;
    this.dbName = dbName;
    this.initialize();
  }

  async initialize(): Promise<void> {
    const dbType = "sqlite";

    this.client = new DatabaseService(
      AGENTDB_BASE_URL,
      this.apiKey,
      AGENTDB_CLIENT_DEBUG
    );

    this.connection = this.client.connect(this.token, this.dbName, dbType);
  }

  async executeSql(statements: SqlStatement[]): Promise<void> {
    if (!this.connection) {
      throw new Error("AgentDB connection not initialized");
    }

    await this.connection.execute(statements);
  }
}

class PostgresDatabase implements DatabaseProvider {
  async executeSql(statements: SqlStatement[]) {
    throw new Error("Method not implemented.");
  }
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: "test",
    });
  }
  return pool;
}

export async function getDatabaseProviderFromAuthenticatedRequest(
  req: AuthenticatedRequest
): Promise<DatabaseProvider> {
  const provider = req.session.dbProviderType;

  switch (provider) {
    case "agentdb":
      if (!req.session.agentDbConnection) {
        throw new Error("AgentDB connection details not found in session");
      }
      return new AgentDBDatabase(req.session.agentDbConnection);
    case "postgres":
      throw new Error("We don't really support Postgres yet 😅");
    default:
      throw new Error("Unsupported database provider type");
  }
}
