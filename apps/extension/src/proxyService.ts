import axios, { AxiosInstance } from "axios";
import * as vscode from "vscode";
import { AuthService } from "./authService";
import { ExecuteSqlSchema, SqlStatement } from "@chatrat/types";

export interface DatabaseInfo {
  name: string;
  type: string;
}

export interface ExecuteResult {
  results?: Array<{
    rows?: any[];
    columns?: string[];
  }>;
}

export interface NaturalLanguageResult {
  sql: string;
  results?: Array<{
    rows?: any[];
    columns?: string[];
  }>;
}

export interface McpSlugResult {
  slug: string;
  shortUrl: string;
}

export class ProxyService {
  private static instance: ProxyService;
  private authService: AuthService;
  private serverBaseUrl: string;
  private httpClient: AxiosInstance;

  private constructor(authService: AuthService) {
    this.authService = authService;
    this.serverBaseUrl = this.getServerBaseUrl();

    this.httpClient = axios.create({
      baseURL: this.serverBaseUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor to include auth token
    this.httpClient.interceptors.request.use((config) => {
      const token = this.authService.getToken();
      if (token) {
        // Send the GitHub token as Bearer token
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor to handle auth errors
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          vscode.window.showErrorMessage(
            "Authentication expired. Please re-authenticate."
          );
          await this.authService.logout();
        }
        return Promise.reject(error);
      }
    );
  }

  public static getInstance(authService?: AuthService): ProxyService {
    if (!ProxyService.instance && authService) {
      ProxyService.instance = new ProxyService(authService);
    }
    return ProxyService.instance;
  }

  private getServerBaseUrl(): string {
    const config = vscode.workspace.getConfiguration("chatrat");
    return config.get<string>("serverBaseUrl") || "https://api.chatrat.cat";
  }

  public async executeQuery(
    statements: SqlStatement[]
  ): Promise<ExecuteResult> {
    try {
      const body: ExecuteSqlSchema = {
        statements,
      };
      const response = await this.httpClient.post("/api/execute-sql", body);

      return response.data;
    } catch (error) {
      console.error("Execute query error:", error);
      throw new Error(
        `Failed to execute query: ${this.getErrorMessage(error)}`
      );
    }
  }

  public async naturalLanguageToSql(
    query: string,
    context: any = null,
    templateName: string = "repo-context-template"
  ): Promise<NaturalLanguageResult> {
    try {
      const response = await this.httpClient.post("/api/agentdb/nl-to-sql", {
        query,
        context,
        templateName,
      });
      return response.data;
    } catch (error) {
      console.error("Natural language to SQL error:", error);
      throw new Error(
        `Failed to process natural language query: ${this.getErrorMessage(
          error
        )}`
      );
    }
  }

  public async copyDatabase(
    sourceDbName: string,
    sourceDbType: string = "sqlite",
    targetDbName?: string
  ): Promise<any> {
    try {
      const response = await this.httpClient.post(
        "/api/agentdb/copy-database",
        {
          sourceDbName,
          sourceDbType,
          targetDbName, // Add this
        }
      );
      return response.data;
    } catch (error) {
      console.error("Copy database error:", error);
      throw new Error(
        `Failed to copy database: ${this.getErrorMessage(error)}`
      );
    }
  }

  public async createMcpSlug(): Promise<McpSlugResult> {
    try {
      const response = await this.httpClient.post(
        "/api/agentdb/create-mcp-slug"
      );
      return response.data;
    } catch (error) {
      console.error("Create MCP slug error:", error);
      throw new Error(
        `Failed to create MCP slug: ${this.getErrorMessage(error)}`
      );
    }
  }

  private getErrorMessage(error: any): string {
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    if (error.message) {
      return error.message;
    }
    return "Unknown error occurred";
  }

  // Helper method to check server health
  public async checkServerHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.serverBaseUrl}/healthz`, {
        timeout: 5000,
      });
      return response.data.status === "ok";
    } catch (error) {
      return false;
    }
  }
}
