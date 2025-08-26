import * as crypto from "crypto";
import * as vscode from "vscode";
import { AuthService } from "./authService";
import { ChatratViewProvider } from "./chatratViewProvider";
import * as dataTransfer from "./dataTransfer";
import { FileData } from "./dataTransfer";
import { McpSlugResult, ProxyService } from "./proxyService";
import { debugLog, OUTPUT_CHANNEL_NAME } from "./util";
import { setupEventListeners } from "./eventListeners";
import { scanDirectory } from "./fileScanner";
import { getRepositoryInfo, formatBytes } from "./pathUtils";

// Global services
let authService: AuthService;
let proxyService: ProxyService;
let activeDbName: string | undefined;
let activeTemplateName: string | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const provider = new ChatratViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatratViewProvider.viewType,
      provider
    )
  );
  const savedMcpUrl = context.globalState.get<string>("chatrat.mcpUrl", "");
  if (savedMcpUrl) provider.updateMcpUrl(savedMcpUrl);

  // Initialize services
  authService = AuthService.getInstance(context);
  proxyService = ProxyService.getInstance(authService);

  // Initialize authentication
  await authService.initialize();

  if (authService.isAuthenticated()) {
    provider.updateAuthState(true);
    await proxyService.checkOrSeedDatabase();
    const indexedRepositories = await dataTransfer.listRepositories(
      proxyService
    );
    authService.setIndexedRepositories(indexedRepositories);
    provider.updateIndexedRepositories(indexedRepositories);

    const currentRepository = authService.getCurrentRepository();
    if (currentRepository && indexedRepositories.includes(currentRepository)) {
      provider.updateHasIndexedCurrentRepository(true);
    }
  }

  // Set up event listeners
  setupEventListeners(context, { authService, proxyService });

  // Register commands
  const sidebarCommand = vscode.commands.registerCommand(
    "chatrat.showSidebar",
    () => {
      // This will focus the Chatrat view in the sidebar
      vscode.commands.executeCommand(
        "workbench.view.extension.chatrat-container"
      );
    }
  );

  const captureCommand = vscode.commands.registerCommand(
    "chatrat.captureAndSend",
    async () => {
      // Check if user has previously consented
      const hasConsented = context.globalState.get("chatrat.hasConsented");

      if (!hasConsented) {
        const consent = await vscode.window.showInformationMessage(
          `Chatrat will index the following:\n\n` +
            `• All source code files in your workspace\n` +
            `• Excluding: node_modules, .git, binary files, etc.\n` +
            `• Files are stored securely\n\n` +
            `We'll create an MCP server so you can grab your code context live from any chatbot (Claude, ChatGPT, etc.). Continue?`,
          {
            modal: true,
            detail:
              'You\'ll get an MCP url after you index. You can delete indexed data anytime using "Clear Database" command.',
          },
          "Index Repository",
          "View Settings First",
          "Cancel"
        );

        if (consent === "View Settings First") {
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "chatrat"
          );
          return;
        } else if (consent !== "Index Repository") {
          return;
        }

        // Save consent
        context.globalState.update("chatrat.hasConsented", true);
      }

      if (!authService.getIsDatabaseSeeded()) {
        await proxyService.checkOrSeedDatabase();
      }

      // Now check authentication
      if ((await ensureAuthenticated()) && authService.getIsDatabaseSeeded()) {
        provider.updateAuthState(true);
        updateStatusBar();
        await captureAndSendRepository(context, provider);
        updateStatusBar();
      }
    }
  );

  const listCommand = vscode.commands.registerCommand(
    "chatrat.listStoredRepositories",
    async () => {
      if (await ensureAuthenticated()) {
        provider.updateAuthState(true);
        updateStatusBar();
        await listStoredRepositories(context);
      }
    }
  );

  const clearCommand = vscode.commands.registerCommand(
    "chatrat.clearDatabase",
    async () => {
      if (await ensureAuthenticated()) {
        provider.updateAuthState(true);
        updateStatusBar();
        await clearDatabase(context, authService, provider);
        provider.updateHasIndexedCurrentRepository(false);
        updateStatusBar();
      }
    }
  );

  const mcpCommand = vscode.commands.registerCommand(
    "chatrat.getMcpUrl",
    async () => {
      if (await ensureAuthenticated()) {
        provider.updateAuthState(true);
        updateStatusBar();
        await getAndStoreMcpUrl(context, provider);
      }
    }
  );

  const authCommand = vscode.commands.registerCommand(
    "chatrat.authenticate",
    async () => {
      const ok = await authService.authenticate();
      if (ok) {
        provider.updateAuthState(true);
        await proxyService.checkOrSeedDatabase();
        updateStatusBar();
      }
    }
  );

  const logoutCommand = vscode.commands.registerCommand(
    "chatrat.logout",
    async () => {
      await authService.logout();
      provider.updateAuthState(false);
      provider.updateHasIndexedCurrentRepository(false);
      provider.updateIndexedRepositories([]);
      updateStatusBar();
    }
  );

  context.subscriptions.push(
    sidebarCommand,
    captureCommand,
    listCommand,
    clearCommand,
    mcpCommand,
    authCommand,
    logoutCommand
  );

  // status bar
  // In activate function, update status bar based on state
  function updateStatusBar() {
    const isAuthenticated = context.globalState.get(
      "chatrat.isAuthenticated",
      false
    );
    const hasIndexedRepo = context.globalState.get(
      "chatrat.hasIndexedRepo",
      false
    );

    if (!isAuthenticated) {
      statusBarItem.text = "💬🐀 (Not authenticated)";
      statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground"
      );
    } else if (!hasIndexedRepo) {
      statusBarItem.text = "💬🐀 (Not indexed)";
      statusBarItem.backgroundColor = undefined;
    } else {
      statusBarItem.text = "💬🐀✅";
      statusBarItem.backgroundColor = undefined;
    }
  }
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  updateStatusBar();
  statusBarItem.tooltip = "Chatrat";
  statusBarItem.command = "chatrat.showSidebar";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  provider.updateAuthState(authService.isAuthenticated());
  updateStatusBar();

  const hasSeenWelcome = context.globalState.get("chatrat.hasSeenWelcome");

  if (!hasSeenWelcome) {
    // Show welcome message
    const choice = await vscode.window.showInformationMessage(
      "👋 Welcome to Chatrat! This extension indexes your code and exposes via MCP so that you can grab your code context live from any chatbot (Claude, ChatGPT, etc.)",
      "Index Now",
      "Learn More"
    );

    if (choice === "Index Now") {
      // Open the sidebar
      vscode.commands.executeCommand(
        "workbench.view.extension.chatrat-container"
      );
    } else if (choice === "Learn More") {
      // Open documentation or the sidebar
      vscode.commands.executeCommand(
        "workbench.view.extension.chatrat-container"
      );
    }

    context.globalState.update("chatrat.hasSeenWelcome", true);
  }

  // Check server health
  const serverHealthy = await proxyService.checkServerHealth();
  if (!serverHealthy) {
    vscode.window
      .showWarningMessage(
        "Server is not available. This is our fault. Please report it",
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
            "Auto-capturing repository context...",
            "View Progress"
          )
          .then((selection) => {
            if (selection === "View Progress") {
              captureAndSendRepository(context, provider);
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

async function ensureDatabase(context: vscode.ExtensionContext): Promise<void> {
  try {
    if (authService.getIsDatabaseSeeded()) {
      debugLog(`Database already provisioned`);
      return;
    }

    debugLog(`Provisioning database...`);
    await proxyService.checkOrSeedDatabase();

    debugLog(`Database ready`);
  } catch (error) {
    console.error("Database connection error:", error);
    throw new Error(`Failed to connect to database: ${error}`);
  }
}

async function getAndStoreMcpUrl(
  context: vscode.ExtensionContext,
  provider: ChatratViewProvider,
  silent: boolean = false
) {
  try {
    const mcpUrl = await createAndStoreMcpSlug(context, silent);
    await context.globalState.update("chatrat.mcpUrl", mcpUrl);
    provider.updateMcpUrl(mcpUrl);
    return mcpUrl;
  } catch (err: any) {
    vscode.window.showErrorMessage(
      `Failed to get MCP URL: ${err.message || err}`
    );
  }
}

async function createAndStoreMcpSlug(
  context: vscode.ExtensionContext,
  silent: boolean = false
) {
  try {
    await ensureDatabase(context);

    const slugResponse: McpSlugResult = await proxyService.createMcpSlug();

    if (!silent) {
      vscode.window
        .showInformationMessage(
          `MCP URL created: ${slugResponse.shortUrl}`,
          "Copy"
        )
        .then((selection) => {
          if (selection === "Copy")
            vscode.env.clipboard.writeText(slugResponse.shortUrl);
        });
    }

    debugLog(`New MCP Slug: ${slugResponse.slug}`);
    debugLog(`New MCP URL: ${slugResponse.shortUrl}`);
    return slugResponse.shortUrl;
  } catch (error) {
    console.error("Create MCP slug error:", error);
    throw error;
  }
}

async function captureAndSendRepository(
  context: vscode.ExtensionContext,
  provider: ChatratViewProvider
) {
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
      title: "Capturing repository",
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

        const scanResult = await scanDirectory(workspaceFolder.uri.fsPath, {
          excludePatterns,
          maxFileSize,
          progress,
          token
        });

        const { files, errors } = scanResult;

        if (token.isCancellationRequested) {
          vscode.window.showInformationMessage("Repository capture cancelled");
          return;
        }

        progress.report({ message: "Storing files...", increment: 70 });
        const repoInfo = getRepositoryInfo();
        if (!repoInfo) {
          throw new Error("Could not get repository information");
        }
        await reindexRepository(
          repoInfo.name,
          repoInfo.workspacePath,
          files
        );

        const newUrl = await getAndStoreMcpUrl(
          context,
          provider,
          /*silent*/ true
        );
        provider.updateHasIndexedCurrentRepository(true);
        const previousRepositories = authService.getIndexedRepositories();
        provider.updateIndexedRepositories([
          ...previousRepositories,
          repoInfo.name,
        ]);
        progress.report({ message: "Complete!", increment: 100 });

        vscode.window
          .showInformationMessage(
            `Successfully stored ${files.length} files in AgentDB. ${
              errors.length > 0 ? `(${errors.length} files skipped)` : ""
            }`,
            "Copy MCP URL",
            "View Details"
          )
          .then((selection) => {
            if (selection === "Copy MCP URL") {
              if (newUrl) {
                vscode.env.clipboard.writeText(newUrl);
              }
            } else if (selection === "View Details") {
              debugLog(`Repository: ${repoInfo.name}`);
              debugLog(`Files stored: ${files.length}`);
              debugLog(
                `Total size: ${formatBytes(
                  files.reduce((acc: number, f: FileData) => acc + f.size, 0)
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

async function reindexRepository(
  repositoryName: string,
  workspacePath: string,
  files: FileData[]
) {
  const startTime = Date.now();
  try {
    const repoId = getRepositoryKey(repositoryName, workspacePath);
    debugLog(`Repository ID: ${repoId}`);
    debugLog(`Repository Name: ${repositoryName}`);
    debugLog(`Total Files to Store: ${files.length}`);

    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    // Upsert repository record
    debugLog("\n--- Upserting Repository ---");
    while (true) {
      const result = await dataTransfer.upsertRepository(proxyService, {
        id: repoId,
        name: repositoryName,
        workspacePath: workspacePath,
        totalFiles: files.length,
        totalSize: totalSize,
      });

      debugLog(`Result: ${JSON.stringify(result)}`);

      if (result.results?.[0]?.rows?.length) {
        break;
      }
    }

    // Delete existing files for this repository
    debugLog("\n--- Deleting Old Files ---");
    await dataTransfer.deleteRepositoryFiles(proxyService, repoId);

    // Insert files in batches
    debugLog("\n--- Inserting New Files ---");
    const batchSize = 20;
    let successCount = 0;
    let errorCount = 0;

    // Create all batches
    const batches: FileData[][] = [];
    for (let i = 0; i < files.length; i += batchSize) {
      batches.push(files.slice(i, i + batchSize));
    }

    debugLog(`Processing ${batches.length} batches in parallel`);

    // Process all batches in parallel
    const results = await Promise.allSettled(
      batches.map(async (batch, index) => {
        debugLog(`Starting batch ${index + 1}/${batches.length}`);

        await withRetries(async () => {
          await dataTransfer.insertRepositoryFilesBatch(
            proxyService,
            repoId,
            batch
          );
        });

        return batch;
      })
    );

    // Count results and log errors
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        successCount++;
        debugLog(`  ✅ Batch ${index + 1} completed successfully`);
      } else {
        errorCount++;
        const batch = batches[index];
        debugLog(
          `  ❌ Error: Failed to insert batch with files ${batch
            .map((f) => f.path)
            .join(", ")} - ${result.reason?.message || result.reason}`
        );
      }
    });

    debugLog(`\n--- Summary ---`);
    debugLog(`Successfully inserted: ${successCount} files`);
    debugLog(`Failed to insert: ${errorCount} files`);

    if (successCount === 0 && files.length > 0) {
      throw new Error(
        `Failed to store any files. Check "${OUTPUT_CHANNEL_NAME}" output for details.`
      );
    }
  } catch (error: any) {
    debugLog(`\n--- CRITICAL ERROR ---`);
    debugLog(`Error: ${error.message || error}`);
    debugLog(`Stack: ${error.stack || "No stack trace"}`);
    throw error;
  }
  const endTime = Date.now();
  debugLog(`Total time: ${(endTime - startTime) / 1000}s`);
}

async function listStoredRepositories(context: vscode.ExtensionContext) {
  try {
    await ensureDatabase(context);

    const result = await dataTransfer.getStoredRepositories(proxyService);

    const outputChannel = vscode.window.createOutputChannel(
      "Stored Repositories"
    );
    outputChannel.appendLine("=== Stored Repositories in Chatrat ===\n");

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

async function clearDatabase(
  context: vscode.ExtensionContext,
  authService: AuthService,
  provider: ChatratViewProvider
) {
  const confirm = await vscode.window.showWarningMessage(
    "Are you sure you want to clear all repository data from Chatrat?",
    { modal: true },
    "Yes, Clear All",
    "Cancel"
  );
  if (confirm !== "Yes, Clear All") return;

  try {
    await ensureDatabase(context);

    await dataTransfer.clearAllRepositoryData(proxyService);

    authService.setIndexedRepositories([]);
    provider.updateIndexedRepositories([]);
    provider.updateHasIndexedCurrentRepository(false);

    vscode.window.showInformationMessage(
      "Successfully cleared all repository data from Chatrat."
    );
  } catch (error: any) {
    console.error("Clear database error:", error);
    vscode.window.showErrorMessage(
      `Failed to clear database: ${error.message || error}`
    );
  }
}



export function deactivate() {
  /* NO-OP */
}
