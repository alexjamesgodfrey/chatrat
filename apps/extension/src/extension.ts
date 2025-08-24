import * as crypto from "crypto";
import * as fs from "fs";
import ignore from "ignore";
import * as path from "path";
import * as vscode from "vscode";
import { AuthService } from "./authService";
import { ProxyService } from "./proxyService";

const theOneAndOnlyOutputChannel = vscode.window.createOutputChannel("Chatrat");
theOneAndOnlyOutputChannel.show(true);

function debugLog(...args: any[]) {
  theOneAndOnlyOutputChannel.appendLine(args.join(" "));
}

interface FileData {
  path: string;
  content: string;
  size: number;
}

// Global services
let authService: AuthService;
let proxyService: ProxyService;
let activeDbName: string | undefined;
let activeTemplateName: string | undefined;

const databaseProvisionedKey = "databaseProvisionedReal2";

export async function activate(context: vscode.ExtensionContext) {
  // Initialize services
  authService = AuthService.getInstance(context);
  proxyService = ProxyService.getInstance(authService);

  // Initialize authentication
  await authService.initialize();

  // Register commands
  const captureCommand = vscode.commands.registerCommand(
    "chatrat.captureAndSend",
    async () => {
      if (await ensureAuthenticated()) {
        await captureAndSendRepository(context);
      }
    }
  );

  const listCommand = vscode.commands.registerCommand(
    "chatrat.listStoredRepositories",
    async () => {
      if (await ensureAuthenticated()) {
        await listStoredRepositories(context);
      }
    }
  );

  const clearCommand = vscode.commands.registerCommand(
    "chatrat.clearDatabase",
    async () => {
      if (await ensureAuthenticated()) {
        await clearDatabase(context);
      }
    }
  );

  const mcpCommand = vscode.commands.registerCommand(
    "chatrat.getMcpUrl",
    async () => {
      if (await ensureAuthenticated()) {
        await getAndStoreMcpUrl(context);
      }
    }
  );

  const authCommand = vscode.commands.registerCommand(
    "chatrat.authenticate",
    async () => {
      await authService.authenticate();
    }
  );

  const logoutCommand = vscode.commands.registerCommand(
    "chatrat.logout",
    async () => {
      await authService.logout();
    }
  );

  context.subscriptions.push(
    captureCommand,
    listCommand,
    clearCommand,
    mcpCommand,
    authCommand,
    logoutCommand
  );

  // Check server health
  const serverHealthy = await proxyService.checkServerHealth();
  if (!serverHealthy) {
    vscode.window
      .showWarningMessage(
        "Authentication server is not available. Please ensure the server is running.",
        "Open Settings"
      )
      .then((selection) => {
        if (selection === "Open Settings") {
          vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "chatrat.serverBaseUrl"
          );
        }
      });
  }

  // Auto-capture on workspace open if enabled and authenticated
  if (
    vscode.workspace.workspaceFolders &&
    vscode.workspace.workspaceFolders.length > 0
  ) {
    const autoCapture = vscode.workspace
      .getConfiguration("chatrat")
      .get<boolean>("autoCapture");
    if (autoCapture && authService.isAuthenticated()) {
      setTimeout(() => {
        vscode.window
          .showInformationMessage(
            "Auto-capturing repository context to AgentDB...",
            "View Progress"
          )
          .then((selection) => {
            if (selection === "View Progress") {
              captureAndSendRepository(context);
            }
          });
      }, 3000);
    }
  }
}

// Ensure user is authenticated before proceeding
async function ensureAuthenticated(): Promise<boolean> {
  if (authService.isAuthenticated()) {
    return true;
  }

  const result = await vscode.window.showInformationMessage(
    "You need to authenticate with GitHub to use this extension.",
    { modal: true },
    "Authenticate",
    "Cancel"
  );

  if (result === "Authenticate") {
    return await authService.authenticate();
  }

  return false;
}

function getRepositoryKey(
  repositoryName: string,
  workspacePath: string
): string {
  const hash = crypto
    .createHash("sha1")
    .update(workspacePath)
    .digest("hex")
    .slice(0, 12);
  return `${repositoryName}:${hash}`;
}

async function createDatabaseWithTemplate(context: vscode.ExtensionContext) {
  try {
    // The copyDatabase function should copy the template to a new database with the user's name
    const response = await proxyService.checkOrSeedDatabase();

    debugLog(`Check or seed database response: ${JSON.stringify(response)}`);
    debugLog(`Database provisioned successfully ✅`);

    // save to vscode.workspace that we provisioned the database
    context.globalState.update(databaseProvisionedKey, true);
  } catch (error) {
    console.error("Template application error:", error);
    throw error;
  }
}

async function ensureDatabase(context: vscode.ExtensionContext): Promise<void> {
  try {
    if (context.globalState.get(databaseProvisionedKey)) {
      debugLog(`Database already provisioned`);
      return;
    }

    debugLog(`Provisioning database...`);
    await createDatabaseWithTemplate(context);

    debugLog(`Database ready`);
  } catch (error) {
    console.error("Database connection error:", error);
    throw new Error(`Failed to connect to database: ${error}`);
  }
}

async function getAndStoreMcpUrl(context: vscode.ExtensionContext) {
  try {
    await createAndStoreMcpSlug(context);
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Failed to get MCP URL: ${err.message || err}`
    );
  }
}

async function createAndStoreMcpSlug(context: vscode.ExtensionContext) {
  try {
    await ensureDatabase(context);

    const slugResponse = await proxyService.createMcpSlug();

    if (!slugResponse?.shortUrl) {
      throw new Error("Failed to create MCP slug: no URL returned");
    }

    vscode.window
      .showInformationMessage(
        `MCP URL created and stored: ${slugResponse.shortUrl}`,
        "Copy to Clipboard"
      )
      .then((selection) => {
        if (selection === "Copy to Clipboard") {
          vscode.env.clipboard.writeText(slugResponse.shortUrl);
        }
      });

    debugLog(`New MCP Slug: ${slugResponse.slug}`);
    debugLog(`New MCP URL: ${slugResponse.shortUrl}`);
    return slugResponse.shortUrl;
  } catch (error) {
    console.error("Create MCP slug error:", error);
    throw error;
  }
}

async function captureAndSendRepository(context: vscode.ExtensionContext) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder is open");
    return;
  }

  const config = vscode.workspace.getConfiguration("chatrat");
  const excludePatterns = config.get<string[]>("excludePatterns") || [];
  const maxFileSize = config.get<number>("maxFileSize") || 1048576;

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Capturing repository to AgentDB",
      cancellable: true,
    },
    async (progress, token) => {
      try {
        progress.report({
          message: "Provisioning database. This can take a while...",
          increment: 0,
        });
        await ensureDatabase(context);

        progress.report({ message: "Scanning files...", increment: 10 });

        const repositoryName = path.basename(workspaceFolder.uri.fsPath);
        const ig = ignore();
        ig.add(excludePatterns);

        // Check for .gitignore
        const gitignorePath = path.join(
          workspaceFolder.uri.fsPath,
          ".gitignore"
        );
        if (fs.existsSync(gitignorePath)) {
          const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
          ig.add(gitignoreContent);
        }

        const files: FileData[] = [];
        const errors: string[] = [];

        await walkDirectory(
          workspaceFolder.uri.fsPath,
          workspaceFolder.uri.fsPath,
          repositoryName,
          files,
          errors,
          ig,
          maxFileSize,
          progress,
          token
        );

        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage("Repository capture cancelled");
          return;
        }

        progress.report({ message: "Storing in AgentDB...", increment: 70 });
        await storeInAgentDB(repositoryName, workspaceFolder.uri.fsPath, files);

        progress.report({ message: "Complete!", increment: 100 });

        vscode.window
          .showInformationMessage(
            `Successfully stored ${files.length} files in AgentDB. ${
              errors.length > 0 ? `(${errors.length} files skipped)` : ""
            }`,
            "View Details",
            "Query Data"
          )
          .then((selection) => {
            if (selection === "View Details") {
              debugLog(`Repository: ${repositoryName}`);
              debugLog(`Files stored: ${files.length}`);
              debugLog(
                `Total size: ${formatBytes(
                  files.reduce((acc, f) => acc + f.size, 0)
                )}`
              );
              debugLog(`Database: ${activeDbName}`);
              debugLog(`Template: ${activeTemplateName}`);
              debugLog(`Timestamp: ${new Date().toISOString()}`);
              if (errors.length > 0) {
                debugLog("\nSkipped files:");
                errors.forEach((err) => debugLog(`  - ${err}`));
              }
            }
          });
      } catch (error: any) {
        console.error("Repository capture error:", error);
        vscode.window
          .showErrorMessage(
            `Failed to capture repository: ${error.message || error}`,
            "View Logs"
          )
          .then((selection) => {
            if (selection === "View Logs") {
              debugLog("Error Details:");
              debugLog(JSON.stringify(error, null, 2));
              debugLog("\nStack Trace:");
              debugLog(error.stack || "No stack trace available");
            }
          });
      }
    }
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function withRetries<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 1000,
  backoffFactor = 1.5
): Promise<T> {
  let retries = 0;
  let delay = initialDelay;
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;
      await sleep(delay);
      delay *= backoffFactor;
    }
  }
  throw new Error("Max retries exceeded");
}

async function storeInAgentDB(
  repositoryName: string,
  workspacePath: string,
  files: FileData[]
) {
  try {
    const repoId = getRepositoryKey(repositoryName, workspacePath);
    debugLog(`Repository ID: ${repoId}`);
    debugLog(`Repository Name: ${repositoryName}`);
    debugLog(`Total Files to Store: ${files.length}`);

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    // Upsert repository record
    debugLog("\n--- Upserting Repository ---");
    while (true) {
      await sleep(10000);

      const result = await proxyService.executeQuery([
        {
          sql: `INSERT INTO repositories (id, name, workspace_path, total_files, total_size, last_updated)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         workspace_path = excluded.workspace_path,
         total_files = excluded.total_files,
         total_size = excluded.total_size,
         last_updated = CURRENT_TIMESTAMP`,
          params: [
            repoId,
            repositoryName,
            workspacePath,
            files.length,
            totalSize,
          ],
        },
      ]);

      debugLog(`Result: ${JSON.stringify(result)}`);

      if (result.results?.[0]?.rows?.length) {
        break;
      }
    }

    // Delete existing files for this repository
    debugLog("\n--- Deleting Old Files ---");
    await proxyService.executeQuery([
      {
        sql: "DELETE FROM repository_files WHERE repository_id = ?",
        params: [repoId],
      },
    ]);

    // Insert files in batches
    debugLog("\n--- Inserting New Files ---");
    const batchSize = 10;
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      debugLog(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          files.length / batchSize
        )}`
      );

      try {
        await withRetries(async () => {
          await proxyService.executeQuery(
            batch.map((file) => ({
              sql: `INSERT INTO repository_files (repository_id, file_path, content, size, created_at)
              VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
              params: [repoId, file.path, file.content, file.size],
            }))
          );
        });
        successCount++;
      } catch (error: any) {
        errorCount++;
        debugLog(
          `  ❌ Error: Failed to insert batch with files ${batch
            .map((f) => f.path)
            .join(", ")}- ${error.message}`
        );
      }

      if (i + batchSize < files.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    debugLog(`\n--- Summary ---`);
    debugLog(`Successfully inserted: ${successCount} files`);
    debugLog(`Failed to insert: ${errorCount} files`);

    if (successCount === 0 && files.length > 0) {
      throw new Error(
        `Failed to store any files. Check "AgentDB Storage Debug" output for details.`
      );
    }
  } catch (error: any) {
    debugLog(`\n--- CRITICAL ERROR ---`);
    debugLog(`Error: ${error.message || error}`);
    debugLog(`Stack: ${error.stack || "No stack trace"}`);
    throw error;
  }
}

async function listStoredRepositories(context: vscode.ExtensionContext) {
  try {
    await ensureDatabase(context);

    const result = await proxyService.executeQuery([
      {
        sql: `SELECT name, workspace_path, total_files, total_size, last_updated
       FROM repositories
       ORDER BY last_updated DESC`,
        params: [],
      },
    ]);

    const outputChannel = vscode.window.createOutputChannel(
      "Stored Repositories"
    );
    outputChannel.appendLine("=== Stored Repositories in AgentDB ===\n");

    if (!result?.results?.[0]?.rows?.length) {
      outputChannel.appendLine("No repositories stored yet.");
    } else {
      result.results[0].rows.forEach((repo: any) => {
        outputChannel.appendLine(`Repository: ${repo.name}`);
        outputChannel.appendLine(`  Path: ${repo.workspace_path}`);
        outputChannel.appendLine(`  Files: ${repo.total_files}`);
        outputChannel.appendLine(`  Size: ${formatBytes(repo.total_size)}`);
        outputChannel.appendLine(`  Last Updated: ${repo.last_updated}`);
        outputChannel.appendLine("");
      });
    }

    outputChannel.show();
  } catch (error: any) {
    console.error("List repositories error:", error);
    vscode.window.showErrorMessage(
      `Failed to list repositories: ${error.message || error}`
    );
  }
}

async function clearDatabase(context: vscode.ExtensionContext) {
  const confirm = await vscode.window.showWarningMessage(
    "Are you sure you want to clear all repository data from AgentDB?",
    { modal: true },
    "Yes, Clear All",
    "Cancel"
  );
  if (confirm !== "Yes, Clear All") return;

  try {
    await ensureDatabase(context);

    await proxyService.executeQuery([
      {
        sql: "DELETE FROM repository_files",
        params: [],
      },
    ]);
    await proxyService.executeQuery([
      {
        sql: "DELETE FROM repositories",
        params: [],
      },
    ]);

    vscode.window.showInformationMessage(
      "Successfully cleared all repository data from AgentDB"
    );
  } catch (error: any) {
    console.error("Clear database error:", error);
    vscode.window.showErrorMessage(
      `Failed to clear database: ${error.message || error}`
    );
  }
}

async function walkDirectory(
  dirPath: string,
  rootPath: string,
  repositoryName: string,
  files: FileData[],
  errors: string[],
  ig: any,
  maxFileSize: number,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  token: vscode.CancellationToken
): Promise<void> {
  if (token.isCancellationRequested) return;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (token.isCancellationRequested) return;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    if (ig.ignores(relativePath)) continue;

    if (entry.isDirectory()) {
      await walkDirectory(
        fullPath,
        rootPath,
        repositoryName,
        files,
        errors,
        ig,
        maxFileSize,
        progress,
        token
      );
    } else if (entry.isFile()) {
      try {
        const stats = fs.statSync(fullPath);

        if (stats.size > maxFileSize) {
          errors.push(
            `${relativePath} (file too large: ${formatBytes(stats.size)})`
          );
          continue;
        }

        if (isBinaryFile(fullPath)) {
          errors.push(`${relativePath} (binary file)`);
          continue;
        }

        const content = fs.readFileSync(fullPath, "utf-8");
        const repoRelativePath = path
          .join(repositoryName, relativePath)
          .replace(/\\/g, "/");

        files.push({
          path: repoRelativePath,
          content,
          size: stats.size,
        });

        if (files.length % 10 === 0) {
          progress.report({
            message: `Processed ${files.length} files...`,
            increment: Math.min(2, 60 / files.length),
          });
        }
      } catch (error) {
        errors.push(`${relativePath} (${error})`);
      }
    }
  }
}

function isBinaryFile(filePath: string): boolean {
  const binaryExtensions = [
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".ico",
    ".svg",
    ".mp3",
    ".mp4",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".db",
    ".sqlite",
    ".class",
    ".jar",
    ".war",
    ".ear",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".otf",
  ];
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function deactivate() {
  /* NO-OP */
}
