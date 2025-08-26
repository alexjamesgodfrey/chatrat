import * as vscode from "vscode";
import { AuthService } from "./authService";
import { ProxyService } from "./proxyService";
import * as dataTransfer from "./dataTransfer";
import { debugLog } from "./util";
import {
  getFilePathInfo,
  isDocumentInWorkspace,
  getRepositoryInfo,
  shouldProcessFile
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

  const problemsWatcher = vscode.languages.onDidChangeDiagnostics(
    async (event) => handleDiagnosticsChange(event, authService, proxyService)
  );

  const fileDeleteWatcher = vscode.workspace.onDidDeleteFiles(
    async (event) => handleFileDeletion(event, authService, proxyService)
  );

  const fileRenameWatcher = vscode.workspace.onDidRenameFiles(
    async (event) => handleFileRename(event, authService, proxyService)
  );

  const fileCreateWatcher = vscode.workspace.onDidCreateFiles(
    async (event) => handleFileCreation(event, authService, proxyService)
  );

  context.subscriptions.push(
    fileWatcher,
    fileCloseWatcher,
    focusWatcher,
    problemsWatcher,
    fileDeleteWatcher,
    fileRenameWatcher
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
  if (!shouldProcessFile(document.uri.fsPath).shouldProcess) return;

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
  if (editor?.document.uri.fsPath && !shouldProcessFile(editor?.document.uri.fsPath).shouldProcess) return;
  if (!editor || !authService.getIsDatabaseSeeded()) return;
  if (!isDocumentInWorkspace(editor.document)) return;

  const repoInfo = getRepositoryInfo();
  const pathInfo = getFilePathInfo(editor.document.uri.fsPath);

  if (!repoInfo || !pathInfo || !pathInfo.isInWorkspace) return;

  // create in case it somehow didn't exist
  await dataTransfer.upsertRepositoryFile(
    proxyService,
    repoInfo.id,
    pathInfo.repoRelativePath,
    editor.document.getText(),
    editor.document.getText().length
  );
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
    if (!shouldProcessFile(uri.fsPath).shouldProcess) return;

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

function handleFileDeletion(
  event: vscode.FileDeleteEvent,
  authService: AuthService,
  proxyService: ProxyService
) {
  if (!authService.getIsDatabaseSeeded() || event.files.length === 0) return;

  const repoInfo = getRepositoryInfo();
  if (!repoInfo) return;

  event.files.forEach(async (uri) => {
    if (!shouldProcessFile(uri.fsPath).shouldProcess) return;

    const pathInfo = getFilePathInfo(uri.fsPath);
    if (!pathInfo || !pathInfo.isInWorkspace) return;

    await dataTransfer.deleteRepositoryFile(
      proxyService,
      repoInfo.id,
      pathInfo.repoRelativePath
    );
  });
}

function handleFileRename(
  event: vscode.FileRenameEvent,
  authService: AuthService,
  proxyService: ProxyService
) {
  if (!shouldProcessFile(event.files[0].newUri.fsPath).shouldProcess) return;
  if (!shouldProcessFile(event.files[0].oldUri.fsPath).shouldProcess) return;
  if (!authService.getIsDatabaseSeeded()) return;
  if (!event.files.length) return;
  if (!event.files[0].oldUri.fsPath) return;
  if (!event.files[0].newUri.fsPath) return;

  const repoInfo = getRepositoryInfo();
  if (!repoInfo) return;

  const oldPathInfo = getFilePathInfo(event.files[0].oldUri.fsPath);
  const newPathInfo = getFilePathInfo(event.files[0].newUri.fsPath);

  if (!oldPathInfo || !newPathInfo) return;

  handleFileDeletion({
    files: [event.files[0].oldUri],
  }, authService, proxyService);
 
  // create the new file
  dataTransfer.upsertRepositoryFile(
    proxyService,
    repoInfo.id,
    newPathInfo.repoRelativePath,
    "",
    0
  );

  dataTransfer.upsertFocusedFile(
    proxyService,
    repoInfo.id,
    newPathInfo.repoRelativePath
  );

  // we will just hope for them to save it soon... 
}

function handleFileCreation(
  event: vscode.FileCreateEvent,
  authService: AuthService,
  proxyService: ProxyService
) {
  if (!shouldProcessFile(event.files[0].fsPath).shouldProcess) return;
  if (!authService.getIsDatabaseSeeded()) return;
  if (!event.files.length) return;
  if (!event.files[0].fsPath) return;

  const repoInfo = getRepositoryInfo();
  if (!repoInfo) return;  
  const pathInfo = getFilePathInfo(event.files[0].fsPath);
  if (!pathInfo) return;

  dataTransfer.upsertRepositoryFile(
    proxyService,
    repoInfo.id,
    pathInfo.repoRelativePath,
    "",
    0
  );

  dataTransfer.upsertFocusedFile(
    proxyService,
    repoInfo.id,
    pathInfo.repoRelativePath
  );
}

