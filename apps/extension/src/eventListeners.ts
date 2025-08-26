import * as vscode from "vscode";
import { AuthService } from "./authService";
import { ProxyService } from "./proxyService";
import * as dataTransfer from "./dataTransfer";
import { debugLog } from "./util";
import {
  getFilePathInfo,
  isDocumentInWorkspace,
  getRepositoryInfo,
} from "./pathUtils";

export interface EventListenerServices {
  authService: AuthService;
  proxyService: ProxyService;
}

export function setupEventListeners(
  context: vscode.ExtensionContext,
  services: EventListenerServices
): void {
  const { authService, proxyService } = services;

  const fileWatcher = vscode.workspace.onDidSaveTextDocument(
    async (document) =>
      await handleFileSave(document, authService, proxyService)
  );

  const fileCloseWatcher = vscode.workspace.onDidCloseTextDocument(
    async (document) =>
      await handleFileClose(document, authService, proxyService)
  );

  const focusWatcher = vscode.window.onDidChangeActiveTextEditor(
    async (editor) => await handleEditorFocus(editor, authService, proxyService)
  );

  const problemsWatcher = vscode.languages.onDidChangeDiagnostics((event) =>
    handleDiagnosticsChange(event, authService, proxyService)
  );

  context.subscriptions.push(
    fileWatcher,
    fileCloseWatcher,
    focusWatcher,
    problemsWatcher
  );
}

async function handleFileSave(
  document: vscode.TextDocument,
  authService: AuthService,
  proxyService: ProxyService
): Promise<void> {
  if (!authService.getIsDatabaseSeeded() || !isDocumentInWorkspace(document))
    return;

  try {
    const repoInfo = getRepositoryInfo();
    const pathInfo = getFilePathInfo(document.uri.fsPath);

    if (!repoInfo || !pathInfo || !pathInfo.isInWorkspace) return;

    const content = document.getText();
    const size = Buffer.byteLength(content, "utf8");

    await dataTransfer.upsertRepositoryFile(
      proxyService,
      repoInfo.id,
      pathInfo.repoRelativePath,
      content,
      size
    );
  } catch (error: any) {
    debugLog(`Failed to update file in database: ${error.message || error}`);
  }
}

async function handleFileClose(
  document: vscode.TextDocument,
  authService: AuthService,
  proxyService: ProxyService
): Promise<void> {
  if (!authService.getIsDatabaseSeeded() || !isDocumentInWorkspace(document))
    return;

  try {
    const repoInfo = getRepositoryInfo();
    const pathInfo = getFilePathInfo(document.uri.fsPath);

    if (!repoInfo || !pathInfo || !pathInfo.isInWorkspace) return;

    await dataTransfer.deleteOpenFileBecauseItClosed(
      proxyService,
      repoInfo.id,
      pathInfo.repoRelativePath
    );
  } catch (error: any) {
    debugLog(`Failed to close file in database: ${error.message || error}`);
  }
}

async function handleEditorFocus(
  editor: vscode.TextEditor | undefined,
  authService: AuthService,
  proxyService: ProxyService
): Promise<void> {
  if (!editor || !authService.getIsDatabaseSeeded()) return;
  if (!isDocumentInWorkspace(editor.document)) return;

  const repoInfo = getRepositoryInfo();
  const pathInfo = getFilePathInfo(editor.document.uri.fsPath);

  if (!repoInfo || !pathInfo || !pathInfo.isInWorkspace) return;

  await dataTransfer.upsertFocusedFile(
    proxyService,
    repoInfo.id,
    pathInfo.repoRelativePath
  );
}

function handleDiagnosticsChange(
  event: vscode.DiagnosticChangeEvent,
  authService: AuthService,
  proxyService: ProxyService
): void {
  if (!authService.getIsDatabaseSeeded() || event.uris.length === 0) return;

  const repoInfo = getRepositoryInfo();
  if (!repoInfo) return;

  event.uris.forEach((uri) => {
    const pathInfo = getFilePathInfo(uri.fsPath);
    if (!pathInfo || !pathInfo.isInWorkspace) return;

    const errors = vscode.languages.getDiagnostics(uri);

    dataTransfer
      .upsertFileDiagnostics(
        proxyService,
        repoInfo.id,
        pathInfo.repoRelativePath,
        JSON.stringify(errors)
      )
      .catch((error) =>
        debugLog(`Failed to update diagnostics: ${error.message || error}`)
      );
  });
}
