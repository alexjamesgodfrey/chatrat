import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { FileData } from "./dataTransfer";
import {
  createFileFilter,
  shouldProcessFile,
  formatBytes,
  getRepositoryInfo,
  normalizeRepoPath
} from "./pathUtils";

export interface ScanOptions {
  excludePatterns?: string[];
  maxFileSize?: number;
  progress?: vscode.Progress<{ message?: string; increment?: number }>;
  token?: vscode.CancellationToken;
}

export interface ScanResult {
  files: FileData[];
  errors: string[];
  totalSize: number;
}

/**
 * Scan a directory recursively and collect all processable files
 */
export async function scanDirectory(
  dirPath: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const {
    excludePatterns = [],
    maxFileSize = 1048576, // 1MB default
    progress,
    token
  } = options;

  const repoInfo = getRepositoryInfo();
  if (!repoInfo) 
    throw new Error("No workspace folder found");

  const files: FileData[] = [];
  const errors: string[] = [];
  const fileFilter = createFileFilter(excludePatterns);

  await walkDirectory(
    dirPath,
    repoInfo.workspacePath,
    repoInfo.name,
    files,
    errors,
    fileFilter,
    maxFileSize,
    progress,
    token
  );

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return {
    files,
    errors,
    totalSize
  };
}

/**
 * Recursively walk through directory structure
 */
async function walkDirectory(
  dirPath: string,
  rootPath: string,
  repositoryName: string,
  files: FileData[],
  errors: string[],
  fileFilter: (relativePath: string) => boolean,
  maxFileSize: number,
  progress?: vscode.Progress<{ message?: string; increment?: number }>,
  token?: vscode.CancellationToken
): Promise<void> {
  if (token?.isCancellationRequested) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    errors.push(`Cannot read directory ${path.relative(rootPath, dirPath)}: ${error}`);
    return;
  }

  for (const entry of entries) {
    if (token?.isCancellationRequested) return;

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);

    // Check if file/directory should be ignored
    if (fileFilter(relativePath)) continue;

    if (entry.isDirectory()) 
      await walkDirectory(
        fullPath,
        rootPath,
        repositoryName,
        files,
        errors,
        fileFilter,
        maxFileSize,
        progress,
        token
      );
    else if (entry.isFile()) 
      await processFile(
        fullPath,
        relativePath,
        repositoryName,
        files,
        errors,
        maxFileSize,
        progress
      );
  }
}

/**
 * Process a single file and add it to the files array if valid
 */
async function processFile(
  fullPath: string,
  relativePath: string,
  repositoryName: string,
  files: FileData[],
  errors: string[],
  maxFileSize: number,
  progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
  try {
    const processResult = shouldProcessFile(fullPath, maxFileSize);
    
    if (!processResult.shouldProcess) {
      if (processResult.reason) 
        errors.push(`${relativePath} (${processResult.reason})`);
      return;
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const stats = fs.statSync(fullPath);
    const repoRelativePath = normalizeRepoPath(path.join(repositoryName, relativePath));

    files.push({
      path: repoRelativePath,
      content,
      size: stats.size,
    });

    // Update progress every 10 files
    if (files.length % 10 === 0 && progress) 
      progress.report({
        message: `Processed ${files.length} files...`,
        increment: Math.min(2, 60 / Math.max(files.length, 1)),
      });

  } catch (error) {
    errors.push(`${relativePath} (${error})`);
  }
}

/**
 * Get file scanning statistics
 */
export function getScanStats(result: ScanResult): {
  totalFiles: number;
  totalSize: string;
  errorCount: number;
} {
  return {
    totalFiles: result.files.length,
    totalSize: formatBytes(result.totalSize),
    errorCount: result.errors.length
  };
}

/**
 * Validate scan result and provide user-friendly error messages
 */
export function validateScanResult(result: ScanResult): {
  isValid: boolean;
  message?: string;
} {
  if (result.files.length === 0) 
    if (result.errors.length > 0)
      return {
        isValid: false,
        message: `No files could be processed. ${result.errors.length} files were skipped.`
      };
    else
      return {
        isValid: false,
        message: "No files found in the workspace."
      };

  return { isValid: true };
}
