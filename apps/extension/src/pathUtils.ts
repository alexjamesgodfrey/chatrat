import * as crypto from "crypto";
import * as fs from "fs";
import ignore from "ignore";
import * as path from "path";
import * as vscode from "vscode";

export interface RepositoryInfo {
  name: string;
  id: string;
  workspacePath: string;
}

export interface FilePathInfo {
  absolutePath: string;
  relativePath: string;
  repoRelativePath: string;
  isInWorkspace: boolean;
}

/**
 * Get repository information for the current workspace
 */
export function getRepositoryInfo(): RepositoryInfo | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return null;

  const workspacePath = workspaceFolder.uri.fsPath;
  const repositoryName = path.basename(workspacePath);
  const repoId = getRepositoryKey(repositoryName, workspacePath);

  return {
    name: repositoryName,
    id: repoId,
    workspacePath,
  };
}

/**
 * Generate a unique repository key based on name and path
 */
export function getRepositoryKey(
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

/**
 * Get normalized file path information for a given file
 */
export function getFilePathInfo(filePath: string): FilePathInfo | null {
  const repoInfo = getRepositoryInfo();
  if (!repoInfo) return null;

  const absolutePath = path.resolve(filePath);
  const isInWorkspace = absolutePath.startsWith(repoInfo.workspacePath);

  if (!isInWorkspace)
    return {
      absolutePath,
      relativePath: "",
      repoRelativePath: "",
      isInWorkspace: false,
    };

  const relativePath = path.relative(repoInfo.workspacePath, absolutePath);
  const repoRelativePath = normalizeRepoPath(
    path.join(repoInfo.name, relativePath)
  );

  return {
    absolutePath,
    relativePath,
    repoRelativePath,
    isInWorkspace: true,
  };
}

/**
 * Normalize a repository-relative path (convert backslashes to forward slashes)
 */
export function normalizeRepoPath(repoPath: string): string {
  return repoPath.replace(/\\/g, "/");
}

/**
 * Check if a file should be ignored based on .gitignore and exclude patterns
 */
export function createFileFilter(
  excludePatterns: string[] = []
): (relativePath: string) => boolean {
  const repoInfo = getRepositoryInfo();
  if (!repoInfo) return () => false;

  const ig = ignore();
  ig.add(excludePatterns);

  // Add .gitignore patterns if the file exists
  const gitignorePath = path.join(repoInfo.workspacePath, ".gitignore");

  if (fs.existsSync(gitignorePath))
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      ig.add(gitignoreContent);
    } catch (error) {
      console.warn("Failed to read .gitignore file:", error);
    }

  return (relativePath: string) => ig.ignores(relativePath);
}

/**
 * Check if a file is binary based on its extension
 */
export function isBinaryFile(filePath: string): boolean {
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

/**
 * Check if a file should be processed (not ignored, not binary, within size limits)
 */
export function shouldProcessFile(
  filePath: string,
  maxFileSize: number,
  fileFilter?: (relativePath: string) => boolean
): { shouldProcess: boolean; reason?: string } {
  const pathInfo = getFilePathInfo(filePath);
  if (!pathInfo || !pathInfo.isInWorkspace)
    return { shouldProcess: false, reason: "File not in workspace" };

  // Check if file is ignored
  if (fileFilter && fileFilter(pathInfo.relativePath))
    return { shouldProcess: false, reason: "File is ignored" };
  // Check if file is binary
  if (isBinaryFile(filePath))
    return { shouldProcess: false, reason: "Binary file" };

  // Check file size
  try {
    const stats = fs.statSync(filePath);
    if (stats.size > maxFileSize)
      return {
        shouldProcess: false,
        reason: `File too large: ${formatBytes(stats.size)}`,
      };
  } catch (error) {
    return { shouldProcess: false, reason: `Cannot read file: ${error}` };
  }

  return { shouldProcess: true };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Validate that a document is within the current workspace
 */
export function isDocumentInWorkspace(document: vscode.TextDocument): boolean {
  const pathInfo = getFilePathInfo(document.uri.fsPath);
  return pathInfo?.isInWorkspace ?? false;
}
