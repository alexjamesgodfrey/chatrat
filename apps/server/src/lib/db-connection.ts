import DatabaseService, { DatabaseConnection } from "@agentdb/sdk";
import { Pool } from "pg";
import { AuthenticatedRequest, DatabaseProvider } from "../types";
import {
  AGENTDB_BASE_URL,
  AGENTDB_CLIENT_DEBUG,
  DEFAULT_AGENTDB_DB_API_KEY,
  DEFAULT_AGENTDB_TOKEN,
} from "./const";
import { SqlStatement } from "@chatrat/types";
import { validateAgentDbString } from "./validate-db";

class AgentDBDatabase implements DatabaseProvider {
  private token: string;
  private apiKey: string;
  private dbName: string;
  private client: DatabaseService | null = null;
  private connection: DatabaseConnection | null = null;

  constructor(
    dbName: string,
    token: string = DEFAULT_AGENTDB_TOKEN,
    apiKey: string = DEFAULT_AGENTDB_DB_API_KEY
  ) {
    this.token = token;
    this.dbName = dbName;
    this.apiKey = apiKey;
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

  async seedDatabaseIfNecessary(): Promise<void> {
    throw new Error("Method not implemented.");
  }
}

class PostgresDatabase implements DatabaseProvider {
  seedDatabaseIfNecessary(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  seedDatabase(): Promise<void> {
    throw new Error("Method not implemented.");
  }
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
      // they use our own connection string
      if (!req.session.agentDbConnection) {
        return new AgentDBDatabase(req.session.githubUser.login);
      }

      const agentDbValidationResult = validateAgentDbString(
        req.session.connectionString
      );

      if (!agentDbValidationResult.isValid) {
        throw new Error(agentDbValidationResult.error);
      }

      return new AgentDBDatabase(
        agentDbValidationResult.components!.dbName,
        agentDbValidationResult.components!.token,
        agentDbValidationResult.components!.apiKey
      );
    case "postgres":
      throw new Error("We don't really support Postgres yet 😅");
    default:
      throw new Error("Unsupported database provider type");
  }
}
