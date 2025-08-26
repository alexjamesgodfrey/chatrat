import { ExecuteSqlSchema, SqlStatement } from "@chatrat/types";
import axios, { AxiosInstance } from "axios";
import * as vscode from "vscode";
import { AuthService } from "./authService";
import { debugLog } from "./util";

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

class WriteQueue<T> {
  private queue: T[];
  private capacity: number;
  private flushInterval: NodeJS.Timeout | null = null;
  private flushTimeoutMs: number;

  constructor(capacity: number, flushTimeoutMs: number = 3000) {
    this.queue = [];
    this.capacity = capacity;
    this.flushTimeoutMs = flushTimeoutMs;
  }

  public isAtCapacity(): boolean {
    return this.queue.length >= this.capacity;
  }

  public enqueue(item: T): void {
    this.queue.push(item);
    this.scheduleFlush();
  }

  public enqueueBatch(items: T[]): void {
    this.queue.push(...items);
    this.scheduleFlush();
  }

  public flushQueue(): T[] {
    const queueCopy = this.queue.slice();
    this.queue = [];
    this.clearFlushTimer();
    return queueCopy;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public isEmpty(): boolean {
    return this.queue.length === 0;
  }

  private scheduleFlush(): void {
    if (this.flushInterval) {
      clearTimeout(this.flushInterval);
    }

    this.flushInterval = setTimeout(() => {
      if (!this.isEmpty()) {
        // Trigger flush callback if provided
        this.onFlushTimeout?.();
      }
    }, this.flushTimeoutMs);
  }

  private clearFlushTimer(): void {
    if (this.flushInterval) {
      clearTimeout(this.flushInterval);
      this.flushInterval = null;
    }
  }

  public setFlushCallback(callback: () => void): void {
    this.onFlushTimeout = callback;
  }

  private onFlushTimeout?: () => void;

  public destroy(): void {
    this.clearFlushTimer();
    this.queue = [];
  }
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
  private sqlQueue: WriteQueue<SqlStatement>;
  private isFlushingQueue: boolean = false;

  private constructor(authService: AuthService) {
    this.authService = authService;
    this.serverBaseUrl = this.getServerBaseUrl();
    this.sqlQueue = new WriteQueue<SqlStatement>(50, 3000); // 20 capacity, 3s timeout

    // Set up auto-flush callback
    this.sqlQueue.setFlushCallback(() => {
      this.flushQueuedStatements().catch(console.error);
    });

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
        config.headers["db-provider-type"] =
          this.authService.getAuthState().dbProviderType;
        config.headers["connection-string"] =
          this.authService.getAuthState().connectionString;
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
    statements: SqlStatement[],
    executeNow: boolean = true
  ): Promise<ExecuteResult> {
    debugLog("Queue size: " + this.sqlQueue.getQueueLength());

    if (executeNow) {
      // First flush any queued operations to preserve ordering
      await this.flushQueuedStatements();

      // Then execute immediately
      return this.executeStatementsNow(statements);
    } else {
      // Add to queue for batched execution
      this.sqlQueue.enqueueBatch(statements);

      // Check if we should flush immediately due to capacity
      if (this.sqlQueue.isAtCapacity()) {
        await this.flushQueuedStatements();
      }

      // Return null for queued operations
      return { results: [] };
    }
  }

  private async executeStatementsNow(
    statements: SqlStatement[]
  ): Promise<ExecuteResult> {
    try {
      const body: ExecuteSqlSchema = {
        statements,
      };
      const response = await this.httpClient.post("/v1/execute-sql", body);

      return response.data;
    } catch (error) {
      console.error("Execute query error:", error);
      throw new Error(
        `Failed to execute query: ${JSON.stringify(error, null, 2)}`
      );
    }
  }

  private async flushQueuedStatements(): Promise<void> {
    if (this.isFlushingQueue || this.sqlQueue.isEmpty()) {
      return;
    }

    this.isFlushingQueue = true;

    try {
      const statements = this.sqlQueue.flushQueue();
      if (statements.length > 0) {
        debugLog(`Auto-flushing ${statements.length} queued SQL statements`);
        await this.executeStatementsNow(statements);
      }
    } catch (error) {
      console.error("Error flushing queued statements:", error);
      // Re-throw to let caller handle the error
      throw error;
    } finally {
      this.isFlushingQueue = false;
    }
  }

  public async flushQueue(): Promise<void> {
    await this.flushQueuedStatements();
  }

  public getQueueLength(): number {
    return this.sqlQueue.getQueueLength();
  }

  public async checkOrSeedDatabase(): Promise<void> {
    try {
      const response = await this.httpClient.post("/v1/check-or-seed");
      if (response.data.success) {
        this.authService.setIsDatabaseSeeded(true);
      }
      return response.data;
    } catch (error) {
      throw new Error(
        `Failed to check or seed database: ${this.getErrorMessage(error)}`
      );
    }
  }

  public async createMcpSlug(): Promise<McpSlugResult> {
    try {
      const response = await this.httpClient.post("/v1/create-mcp-slug");

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

  public async dispose(): Promise<void> {
    // Flush any remaining queued statements before disposing
    try {
      await this.flushQueuedStatements();
    } catch (error) {
      console.error("Error flushing queue during disposal:", error);
    }

    // Clean up the queue
    this.sqlQueue.destroy();
  }
}
