import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore';
import { DatabaseService, DatabaseConnection } from '@agentdb/sdk';

// ===== CONFIGURATION - HARDCODE YOUR VALUES HERE =====
const AGENTDB_TOKEN = 'b2075fcc-6c57-48d4-b7e0-75f1dc93af16';  // Replace with your AgentDB token
const AGENTDB_API_KEY = 'agentdb_1bcb5dea66ac08a9fd856792092ddd6f182c7d38b3397313160096c0d90a3cfe';   // Replace with your AgentDB API key
const AGENTDB_BASE_URL = 'https://api.agentdb.dev';
// ===================================================

interface FileData {
  path: string;
  content: string;
  size: number;
}

let agentDbService: DatabaseService | undefined;
let agentDbConnection: DatabaseConnection | undefined;
let activeDbName: string | undefined; // computed per user
let activeTemplateName: string | undefined; // usually 'repo-context'

export function activate(context: vscode.ExtensionContext) {
  console.log('Repository Context Capture (AgentDB) extension is now active!');

  // Initialize AgentDB service (no DB chosen yet)
  initializeAgentDB();

  // Register commands
  const captureCommand = vscode.commands.registerCommand('repoContextCapture.captureAndSend', () => {
    captureAndSendRepository();
  });

  const queryCommand = vscode.commands.registerCommand('repoContextCapture.queryRepository', () => {
    queryRepositoryContext();
  });

  const listCommand = vscode.commands.registerCommand('repoContextCapture.listStoredRepositories', () => {
    listStoredRepositories();
  });

  const clearCommand = vscode.commands.registerCommand('repoContextCapture.clearDatabase', () => {
    clearDatabase();
  });

  const mcpCommand = vscode.commands.registerCommand(
  'repoContextCapture.getMcpUrl',
  async () => {
    await getAndStoreMcpUrl(context);
  }
);

  context.subscriptions.push(captureCommand, queryCommand, listCommand, clearCommand, mcpCommand);

  // Auto-capture on workspace open if enabled
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const autoCapture = vscode.workspace.getConfiguration('repoContextCapture').get<boolean>('autoCapture');
    if (autoCapture) {
      setTimeout(() => {
        vscode.window
          .showInformationMessage('Auto-capturing repository context to AgentDB...', 'View Progress')
          .then(selection => {
            if (selection === 'View Progress') {
              captureAndSendRepository();
            }
          });
      }, 3000);
    }
  }
}

function initializeAgentDB() {
  try {
    const config = vscode.workspace.getConfiguration('repoContextCapture');
    const token = config.get<string>('agentDbToken') || AGENTDB_TOKEN;
    const apiKey = config.get<string>('agentDbApiKey') || AGENTDB_API_KEY;

    if (!token || token === 'your-uuid-token-here') {
      vscode.window.showErrorMessage('Please configure your AgentDB token in the extension settings or hardcode it in the extension file.');
      return;
    }
    if (!apiKey || apiKey === 'your-api-key-here') {
      vscode.window.showErrorMessage('Please configure your AgentDB API key in the extension settings or hardcode it in the extension file.');
      return;
    }

    agentDbService = new DatabaseService(AGENTDB_BASE_URL, apiKey);
    activeDbName = undefined; // will be computed in ensureDatabase()
    activeTemplateName = getTemplateName();

    console.log('AgentDB service initialized successfully');
  } catch (error) {
    console.error('Failed to initialize AgentDB:', error);
    vscode.window.showErrorMessage(`Failed to initialize AgentDB: ${error}`);
  }
}

/**
 * Compute a stable per-user DB name. Default uses VS Code machineId but can be overridden.
 * Example result: repo-context-<userId>
 */
function getUserDbName(): string {
  const config = vscode.workspace.getConfiguration('repoContextCapture');
  const userId = (config.get<string>('userId') || getUserId()).trim();
  const base = 'repo-context';
  // keep it simple & filesystem-friendly
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return `${base}-${safeUser || 'unknown'}`.slice(0, 32);
}

function getRepositoryKey(repositoryName: string, workspacePath: string): string {
  const hash = crypto.createHash('sha1').update(workspacePath).digest('hex').slice(0, 12);
  return `${repositoryName}:${hash}`; // <= stable & human-ish
}

function getTemplateName(): string {
  const config = vscode.workspace.getConfiguration('repoContextCapture');
  return 'repo-context-template';
}

function getUserId(): string {
  // VS Code provides a stable anonymous machineId; good default for “constant unique user identifier”
  return vscode.env.machineId || 'unknown';
}

async function checkTableExists(conn: DatabaseConnection, tableName: string): Promise<boolean> {
  const res = await conn.execute({
    sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    params: [tableName],
  });
  return !!res?.results?.[0]?.rows?.length;
}

async function applyTemplate(connection: DatabaseConnection, databaseName: string) {
  if (!agentDbService) throw new Error("AgentDB service not initialized");

  const response = await agentDbService.copyDatabase(AGENTDB_TOKEN, 'alex-boiler', 'sqlite', AGENTDB_TOKEN, databaseName);


  const outputChannel = vscode.window.createOutputChannel("Alex3 Repository Context Capture");
  outputChannel.show(true);
  outputChannel.appendLine(`response: ${JSON.stringify(response)}`);
//   outputChannel.appendLine(`Found ${initSql.length} SQL migration(s)\n`);

//   if (initSql.length === 0) {
//     throw new Error(
//       `Template "${templateName}" not found or has no initializationSql. Make sure it exists in AgentDB.`
//     );
//   }

//   for (let i = 0; i < initSql.length; i++) {
//     const sqlBlock = initSql[i].trim();

//     if (!sqlBlock) {
//       outputChannel.appendLine(`Skipping empty SQL block #${i + 1}`);
//       continue;
//     }

//     outputChannel.appendLine(`\n[Migration ${i + 1}/${initSql.length}] Starting...`);
//     outputChannel.appendLine(sqlBlock);

//     try {
//       await connection.execute({ sql: sqlBlock, params: [] });
//       outputChannel.appendLine(`[Migration ${i + 1}] ✅ Success`);
//     } catch (err: any) {
//       outputChannel.appendLine(`[Migration ${i + 1}] ❌ Failed: ${err.message}`);
//       throw err; // stop applying if one fails
//     }
//   }

//   outputChannel.appendLine(`\n--- Template "${templateName}" applied successfully ✅ ---`);
}


/**
 * Ensure that the per-user database exists.
 * If it doesn't, create it by applying the given template's initialization SQL.
 */
async function ensureDatabase(): Promise<void> {
  if (!agentDbService) {
    initializeAgentDB();
  }
  if (!agentDbService) {
    throw new Error('AgentDB service not initialized');
  }

  const config = vscode.workspace.getConfiguration('repoContextCapture');
  const token = config.get<string>('agentDbToken') || AGENTDB_TOKEN;

  const dbName = getUserDbName();
  const templateName = getTemplateName();

  const outputChannel = vscode.window.createOutputChannel('Alex2 Repository Context Capture');

  // Always check existence (no cache short-circuit)
  const dbs = await agentDbService.listDatabases(token);
  const exists = dbs.some((d) => d.name === dbName);

  outputChannel.appendLine(`dbs: ${JSON.stringify(dbs)}`);
  outputChannel.appendLine(`dbName: ${dbName}`);
  outputChannel.appendLine(`ensureDatabase: ${dbName} exists? ${exists}`);

  // Create or open connection
  const connection = agentDbService.connect(token, dbName, 'sqlite');

  if (!exists) {
    // DB doesn't exist yet: create from template
    await applyTemplate(connection, dbName);
  } else {
  }

  agentDbConnection = connection;
  activeDbName = dbName;
  activeTemplateName = templateName;

  try {
    const cols = await agentDbConnection.execute({ sql: `PRAGMA table_info(repositories)`, params: [] });
    const rows = cols?.results?.[0]?.rows ?? [];
    const idCol = rows.find((r: any) => r.name === 'id');
    // type is in r.type, pk flag in r.pk (1 means part of primary key)
    if (!idCol || idCol.pk !== 1 || String(idCol.type).toUpperCase() !== 'TEXT') {
      vscode.window.showWarningMessage(
        `AgentDB "repositories" schema mismatch. Expected: id TEXT PRIMARY KEY. ` +
        `Current: ${idCol ? `${idCol.type} pk=${idCol.pk}` : 'missing id'}. ` +
        `Update your template to:
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  total_files INTEGER,
  total_size INTEGER
);
CREATE TABLE repository_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  content TEXT,
  size INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(repository_id, file_path)
);`
      );
    }
  } catch {}

  console.log(`AgentDB ready. Database: ${activeDbName} (template ensured: ${activeTemplateName})`);
}

async function getAndStoreMcpUrl(context: vscode.ExtensionContext) {
  try {
    const storedUrl = context.globalState.get<string>('mcpUrl');
    const storedSlug = context.globalState.get<string>('mcpSlug');

    if (storedUrl && storedSlug) {
      // Already have one stored
      vscode.window.showInformationMessage(
        `Stored MCP URL: ${storedUrl}`,
        'Copy to Clipboard',
        'Refresh'
      ).then(async selection => {
        if (selection === 'Copy to Clipboard') {
          vscode.env.clipboard.writeText(storedUrl);
        } else if (selection === 'Refresh') {
          // force a refresh (create a new slug)
          await createAndStoreMcpSlug(context);
        }
      });

      const outputChannel = vscode.window.createOutputChannel('MCP URL Debug');
      outputChannel.appendLine(`Stored MCP Slug: ${storedSlug}`);
      outputChannel.appendLine(`Stored MCP URL: ${storedUrl}`);
      outputChannel.show();
      return;
    }

    // No stored slug yet → create a new one
    await createAndStoreMcpSlug(context);

  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to get MCP URL: ${err.message || err}`);
  }
}

/**
 * Helper: actually create a slug, persist it, and show it
 */
async function createAndStoreMcpSlug(context: vscode.ExtensionContext) {
  if (!agentDbService) await ensureDatabase();
  if (!agentDbService || !activeDbName) {
    throw new Error('AgentDB not initialized or database name unavailable');
  }

  const config = vscode.workspace.getConfiguration('repoContextCapture');
  const token = config.get<string>('agentDbToken') || AGENTDB_TOKEN;
  const apiKey = config.get<string>('agentDbApiKey') || AGENTDB_API_KEY;

  const slugResponse = await agentDbService.createMcpSlug({
    key: apiKey,
    token,
    dbName: activeDbName
  });

  if (!slugResponse?.shortUrl) {
    throw new Error('Failed to create MCP slug: no URL returned');
  }

  await context.globalState.update('mcpSlug', slugResponse.slug);
  await context.globalState.update('mcpUrl', slugResponse.shortUrl);

  vscode.window.showInformationMessage(
    `MCP URL created and stored: ${slugResponse.shortUrl}`,
    'Copy to Clipboard'
  ).then(selection => {
    if (selection === 'Copy to Clipboard') {
      vscode.env.clipboard.writeText(slugResponse.shortUrl);
    }
  });

  const outputChannel = vscode.window.createOutputChannel('MCP URL Debug');
  outputChannel.appendLine(`New MCP Slug: ${slugResponse.slug}`);
  outputChannel.appendLine(`New MCP URL: ${slugResponse.shortUrl}`);
  outputChannel.show();
}


async function captureAndSendRepository() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder is open');
    return;
  }

  if (!agentDbService) {
    vscode.window.showErrorMessage('AgentDB service not initialized. Please check your configuration.');
    return;
  }

  const config = vscode.workspace.getConfiguration('repoContextCapture');
  const excludePatterns = config.get<string[]>('excludePatterns') || [];
  const maxFileSize = config.get<number>('maxFileSize') || 1048576;

  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Capturing repository to AgentDB',
      cancellable: true
    },
    async (progress, token) => {
      try {
        // Ensure per-user database exists (created from template if needed)
        progress.report({ message: 'Ensuring user database...', increment: 0 });
        await ensureDatabase();
        if (!agentDbConnection) throw new Error('AgentDB connection not available');

        progress.report({ message: 'Scanning files...', increment: 10 });

        // Get repository name from folder name
        const repositoryName = path.basename(workspaceFolder.uri.fsPath);

        // Create ignore instance
        const ig = ignore();
        ig.add(excludePatterns);

        // Check for .gitignore
        const gitignorePath = path.join(workspaceFolder.uri.fsPath, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
          const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
          ig.add(gitignoreContent);
        }

        // Collect all files
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
          vscode.window.showInformationMessage('Repository capture cancelled');
          return;
        }

        progress.report({ message: 'Storing in AgentDB...', increment: 70 });

        // Store in AgentDB (assumes template already created required tables)
        await storeInAgentDB(repositoryName, workspaceFolder.uri.fsPath, files);

        progress.report({ message: 'Complete!', increment: 100 });

        const dbNameForMsg = activeDbName || getUserDbName();

        vscode.window
          .showInformationMessage(
            `Successfully stored ${files.length} files in AgentDB (${dbNameForMsg}). ${
              errors.length > 0 ? `(${errors.length} files skipped)` : ''
            }`,
            'View Details',
            'Query Data'
          )
          .then(selection => {
            if (selection === 'View Details') {
              const outputChannel = vscode.window.createOutputChannel('Alex Repository Context Capture');
              outputChannel.appendLine(`Repository: ${repositoryName}`);
              outputChannel.appendLine(`Files stored: ${files.length}`);
              outputChannel.appendLine(`Total size: ${formatBytes(files.reduce((acc, f) => acc + f.size, 0))}`);
              outputChannel.appendLine(`Database: ${dbNameForMsg}`);
              outputChannel.appendLine(`Template: ${activeTemplateName}`);
              outputChannel.appendLine(`Timestamp: ${new Date().toISOString()}`);
              if (errors.length > 0) {
                outputChannel.appendLine('\nSkipped files:');
                errors.forEach(err => outputChannel.appendLine(`  - ${err}`));
              }
              outputChannel.show();
            } else if (selection === 'Query Data') {
              queryRepositoryContext();
            }
          });
      } catch (error: any) {
        console.error('Repository capture error:', error);
        vscode.window
          .showErrorMessage(`Failed to capture repository: ${error.message || error}`, 'View Logs')
          .then(selection => {
            if (selection === 'View Logs') {
              const outputChannel = vscode.window.createOutputChannel('Alex Repository Context Capture');
              outputChannel.appendLine('Error Details:');
              outputChannel.appendLine(JSON.stringify(error, null, 2));
              outputChannel.appendLine('\nStack Trace:');
              outputChannel.appendLine(error.stack || 'No stack trace available');
              outputChannel.show();
            }
          });
      }
    }
  );
}

async function storeInAgentDB(repositoryName: string, workspacePath: string, files: FileData[]) {
  if (!agentDbConnection) throw new Error('AgentDB connection not initialized');

  const outputChannel = vscode.window.createOutputChannel('AgentDB Storage Debug');
  outputChannel.show();
  
  try {
    // Deterministic repo id (must match your template schema: repositories.id TEXT PRIMARY KEY)
    const repoId = getRepositoryKey(repositoryName, workspacePath);
    outputChannel.appendLine(`Repository ID: ${repoId}`);
    outputChannel.appendLine(`Repository Name: ${repositoryName}`);
    outputChannel.appendLine(`Total Files to Store: ${files.length}`);
    
    // First, upsert the repository record
    outputChannel.appendLine('\n--- Upserting Repository ---');
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    
    const repoResult = await agentDbConnection.execute({
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
    });
    
    outputChannel.appendLine(`Repository upsert result: ${JSON.stringify(repoResult?.results?.[0]?.rows || 'unknown')}`);
    
    // Verify the repository was inserted
    const verifyRepo = await agentDbConnection.execute({
      sql: 'SELECT * FROM repositories WHERE id = ?',
      params: [repoId]
    });
    outputChannel.appendLine(`Repository verification: ${JSON.stringify(verifyRepo?.results?.[0]?.rows?.[0] || 'not found')}`);
    
    // Delete existing files for this repository
    outputChannel.appendLine('\n--- Deleting Old Files ---');
    const deleteResult = await agentDbConnection.execute({
      sql: 'DELETE FROM repository_files WHERE repository_id = ?',
      params: [repoId]
    });
    outputChannel.appendLine(`Deleted rows: ${deleteResult?.results?.[0]?.rows || 0}`);
    
    // Insert files in smaller batches with individual error handling
    outputChannel.appendLine('\n--- Inserting New Files ---');
    const batchSize = 10; // Smaller batch size for better error tracking
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      outputChannel.appendLine(`\nProcessing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(files.length/batchSize)} (files ${i+1}-${Math.min(i+batchSize, files.length)})`);
      
      // Try to insert each file individually to identify problematic ones
      for (const file of batch) {
        try {
          const insertResult = await agentDbConnection.execute({
            sql: `INSERT INTO repository_files (repository_id, file_path, content, size, created_at)
                  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            params: [repoId, file.path, file.content, file.size]
          });
          
          if (insertResult?.results?.[0]?.rows) {
            successCount++;
          } else {
            errorCount++;
            errors.push(`Failed to insert: ${file.path} (no rows affected)`);
            outputChannel.appendLine(`  ❌ Failed: ${file.path} - no rows affected`);
          }
        } catch (error: any) {
          errorCount++;
          const errorMsg = `Failed to insert: ${file.path} - ${error.message || error}`;
          errors.push(errorMsg);
          outputChannel.appendLine(`  ❌ Error: ${errorMsg}`);
          
          // Log more details about the problematic file
          outputChannel.appendLine(`    File details: size=${file.size}, path length=${file.path.length}, content length=${file.content.length}`);
          
          // Continue with next file instead of failing entire batch
          continue;
        }
      }
      
      // Add a small delay between batches to avoid overwhelming the database
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    outputChannel.appendLine(`\n--- Summary ---`);
    outputChannel.appendLine(`Successfully inserted: ${successCount} files`);
    outputChannel.appendLine(`Failed to insert: ${errorCount} files`);
    
    // Verify the final count in the database
    const countResult = await agentDbConnection.execute({
      sql: 'SELECT COUNT(*) as count FROM repository_files WHERE repository_id = ?',
      params: [repoId]
    });
    const actualCount = countResult?.results?.[0]?.rows?.[0]?.count || 0;
    outputChannel.appendLine(`Actual files in database: ${actualCount}`);
    
    // List a few files to verify they were stored
    const sampleFiles = await agentDbConnection.execute({
      sql: 'SELECT file_path, size FROM repository_files WHERE repository_id = ? LIMIT 5',
      params: [repoId]
    });
    outputChannel.appendLine(`\nSample stored files:`);
    sampleFiles?.results?.[0]?.rows?.forEach((row: any) => {
      outputChannel.appendLine(`  - ${row.file_path} (${row.size} bytes)`);
    });
    
    if (errorCount > 0) {
      outputChannel.appendLine(`\n--- Errors ---`);
      errors.slice(0, 10).forEach(err => outputChannel.appendLine(err));
      if (errors.length > 10) {
        outputChannel.appendLine(`... and ${errors.length - 10} more errors`);
      }
      
      vscode.window.showWarningMessage(
        `Stored ${successCount} of ${files.length} files. ${errorCount} files failed. Check "AgentDB Storage Debug" output for details.`
      );
    }
    
    // If no files were successfully stored, throw an error
    if (successCount === 0 && files.length > 0) {
      throw new Error(`Failed to store any files. Check "AgentDB Storage Debug" output for details.`);
    }
    
  } catch (error: any) {
    outputChannel.appendLine(`\n--- CRITICAL ERROR ---`);
    outputChannel.appendLine(`Error: ${error.message || error}`);
    outputChannel.appendLine(`Stack: ${error.stack || 'No stack trace'}`);
    throw error;
  }
}

async function queryRepositoryContext() {
  if (!agentDbConnection) {
    vscode.window.showErrorMessage('AgentDB connection not initialized');
    return;
  }

  const query = await vscode.window.showInputBox({
    prompt: 'Enter a natural language query about your repository',
    placeHolder: 'e.g., "Show me all TypeScript files", "Find files containing TODO comments"'
  });

  if (!query) return;

  vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Querying AgentDB', cancellable: false },
    async (progress) => {
      try {
        progress.report({ message: 'Processing query...', increment: 50 });

        const result = await agentDbConnection!.naturalLanguageToSql(
          query,
          null,
          activeTemplateName || getTemplateName()
        );

        progress.report({ message: 'Complete!', increment: 100 });

        const outputChannel = vscode.window.createOutputChannel('Alex Repository Query Results');
        outputChannel.appendLine(`Query: ${query}`);
        outputChannel.appendLine(`\nGenerated SQL:\n${result.sql}`);
        outputChannel.appendLine('\n--- Results ---');

        if (result.results && result.results[0] && result.results[0].rows) {
          outputChannel.appendLine(JSON.stringify(result.results[0].rows, null, 2));
        } else {
          outputChannel.appendLine('No results found');
        }

        outputChannel.show();
      } catch (error: any) {
        console.error('Query error:', error);
        vscode.window.showErrorMessage(`Query failed: ${error.message || error}`);
      }
    }
  );
}

async function listStoredRepositories() {
  if (!agentDbService) {
    vscode.window.showErrorMessage('AgentDB service not initialized');
    return;
  }
  try {
    await ensureDatabase();
    if (!agentDbConnection) throw new Error('AgentDB connection not initialized');

    const result = await agentDbConnection.execute({
      sql: `SELECT name, workspace_path, total_files, total_size, last_updated 
            FROM repositories 
            ORDER BY last_updated DESC`,
      params: []
    });

    const outputChannel = vscode.window.createOutputChannel('Alex Stored Repositories');
    outputChannel.appendLine('=== Stored Repositories in AgentDB ===\n');

    if (!result?.results?.[0]?.rows?.length) {
      outputChannel.appendLine('No repositories stored yet.');
    } else {
      result.results[0].rows.forEach((repo: any) => {
        outputChannel.appendLine(`Repository: ${repo.name}`);
        outputChannel.appendLine(`  Path: ${repo.workspace_path}`);
        outputChannel.appendLine(`  Files: ${repo.total_files}`);
        outputChannel.appendLine(`  Size: ${formatBytes(repo.total_size)}`);
        outputChannel.appendLine(`  Last Updated: ${repo.last_updated}`);
        outputChannel.appendLine('');
      });
    }

    outputChannel.show();
  } catch (error: any) {
    console.error('List repositories error:', error);
    vscode.window.showErrorMessage(`Failed to list repositories: ${error.message || error}`);
  }
}

async function clearDatabase() {
  const confirm = await vscode.window.showWarningMessage(
    'Are you sure you want to clear all repository data from AgentDB?',
    { modal: true },
    'Yes, Clear All',
    'Cancel'
  );
  if (confirm !== 'Yes, Clear All') return;

  try {
    await ensureDatabase();
    if (!agentDbConnection) throw new Error('AgentDB connection not initialized');

    await agentDbConnection.execute([
      { sql: 'DELETE FROM repository_files', params: [] },
      { sql: 'DELETE FROM repositories', params: [] }
    ]);

    vscode.window.showInformationMessage('Successfully cleared all repository data from AgentDB');
  } catch (error: any) {
    console.error('Clear database error:', error);
    vscode.window.showErrorMessage(`Failed to clear database: ${error.message || error}`);
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

    // Check if should ignore
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

        // Skip large files
        if (stats.size > maxFileSize) {
          errors.push(`${relativePath} (file too large: ${formatBytes(stats.size)})`);
          continue;
        }

        // Skip binary files
        if (isBinaryFile(fullPath)) {
          errors.push(`${relativePath} (binary file)`);
          continue;
        }

        const content = fs.readFileSync(fullPath, 'utf-8');
        const repoRelativePath = path.join(repositoryName, relativePath).replace(/\\/g, '/');

        files.push({
          path: repoRelativePath,
          content,
          size: stats.size
        });

        // Update progress
        if (files.length % 10 === 0) {
          progress.report({
            message: `Processed ${files.length} files...`,
            increment: Math.min(2, 60 / files.length)
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
    '.exe', '.dll', '.so', '.dylib', '.pdf', '.zip', '.tar', '.gz',
    '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg',
    '.mp3', '.mp4', '.avi', '.mov', '.wmv', '.flv',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.db', '.sqlite', '.class', '.jar', '.war', '.ear',
    '.woff', '.woff2', '.ttf', '.eot', '.otf'
  ];
  const ext = path.extname(filePath).toLowerCase();
  return binaryExtensions.includes(ext);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function deactivate() {}
