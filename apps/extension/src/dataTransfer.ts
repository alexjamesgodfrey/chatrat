import { ProxyService } from "./proxyService";

export interface FileData {
  path: string;
  content: string;
  size: number;
}

export interface RepositoryData {
  id: string;
  name: string;
  workspacePath: string;
  totalFiles: number;
  totalSize: number;
}

/**
 * Upsert a single file in the repository_files table
 */
export async function upsertRepositoryFile(
  proxyService: ProxyService,
  repoId: string,
  filePath: string,
  content: string,
  size: number
): Promise<void> {
  await proxyService.executeQuery(
    [
      {
        sql: `INSERT INTO repository_files (repository_id, file_path, content, size, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(repository_id, file_path) DO UPDATE SET
            content = excluded.content,
            size = excluded.size,
            created_at = CURRENT_TIMESTAMP`,
        params: [repoId, filePath, content, size],
      },
    ],
    false
  );
}

/**
 * Upsert repository metadata in the repositories table
 */
export async function upsertRepository(
  proxyService: ProxyService,
  repositoryData: RepositoryData
): Promise<any> {
  const runInBackground = false;
  const result = await proxyService.executeQuery(
    [
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
          repositoryData.id,
          repositoryData.name,
          repositoryData.workspacePath,
          repositoryData.totalFiles,
          repositoryData.totalSize,
        ],
      },
    ],
    !runInBackground
  );
  return result;
}

/**
 * Delete all files for a specific repository
 */
export async function deleteRepositoryFiles(
  proxyService: ProxyService,
  repoId: string
): Promise<void> {
  await proxyService.executeQuery(
    [
      {
        sql: "DELETE FROM repository_files WHERE repository_id = ?",
        params: [repoId],
      },
    ],
    false
  );
}

/**
 * Insert multiple files in batch for a repository
 */
export async function insertRepositoryFilesBatch(
  proxyService: ProxyService,
  repoId: string,
  files: FileData[]
): Promise<void> {
  await proxyService.executeQuery(
    files.map((file) => ({
      sql: `INSERT INTO repository_files (repository_id, file_path, content, size, created_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      params: [repoId, file.path, file.content, file.size],
    })),
    false
  );
}

/**
 * Get all stored repositories ordered by last updated
 */
export async function getStoredRepositories(
  proxyService: ProxyService
): Promise<any> {
  const result = await proxyService.executeQuery([
    {
      sql: `SELECT name, workspace_path, total_files, total_size, last_updated
            FROM repositories
            ORDER BY last_updated DESC`,
      params: [],
    },
  ]);
  return result;
}

/**
 * Clear all repository data (both repositories and files)
 */
export async function clearAllRepositoryData(
  proxyService: ProxyService
): Promise<void> {
  await proxyService.executeQuery([
    {
      sql: "DELETE FROM repository_files",
      params: [],
    },
    {
      sql: "DELETE FROM repositories",
      params: [],
    },
  ]);
}

export async function upsertFocusedFile(
  proxyService: ProxyService,
  repoId: string,
  filePath: string
): Promise<void> {
  await proxyService.executeQuery(
    [
      {
        sql: `INSERT INTO open_files (repository_id, file_path, is_focused, opened_at)
                VALUES (?, ?, 1, CURRENT_TIMESTAMP)
                ON CONFLICT(repository_id, file_path) DO UPDATE SET
                is_focused = 1,
                opened_at = CURRENT_TIMESTAMP`,
        params: [repoId, filePath],
      },
    ],
    false
  );
}

export async function upsertFileDiagnostics(
  proxyService: ProxyService,
  repoId: string,
  filePath: string,
  errorsJson: string
): Promise<void> {
  console.log(
    `I want to upsert the following diagnostics for ${repoId} and ${filePath}: ${errorsJson}`
  );
  await proxyService.executeQuery(
    [
      {
        sql: `
        INSERT INTO open_files (repository_id, file_path, diagnostics)
                VALUES (?, ?, ?)
                ON CONFLICT(repository_id, file_path) DO UPDATE SET
                diagnostics = excluded.diagnostics
        `,
        params: [repoId, filePath, errorsJson],
      },
    ],
    false
  );
}

export async function deleteOpenFileBecauseItClosed(
  proxyService: ProxyService,
  repoId: string,
  filePath: string
): Promise<void> {
  const result = await proxyService.executeQuery(
    [
      {
        sql: `
        DELETE FROM open_files
        WHERE repository_id = ? AND file_path = ?
        `,
        params: [repoId, filePath],
      },
    ],
    false
  );

  console.log("result from deleting:" + JSON.stringify(result));
}
