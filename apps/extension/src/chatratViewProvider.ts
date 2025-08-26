import * as vscode from "vscode";

export class ChatratViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "chatrat.sidebar";

  private _view?: vscode.WebviewView;
  private isAuthenticated: boolean = false;
  private hasIndexedCurrentRepository: boolean = false;
  private mcpUrl: string = "";
  private indexedRepositories: string[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {}

  public refresh() {
    if (this._view) {
      this._view.webview.html = this._getHtmlForWebview(this._view.webview);
    }
  }

  public updateAuthState(isAuthenticated: boolean) {
    this.isAuthenticated = isAuthenticated;
    this.refresh();
  }

  public updateHasIndexedCurrentRepository(hasIndexed: boolean) {
    this.hasIndexedCurrentRepository = hasIndexed;
    this.refresh();
  }

  public updateMcpUrl(url: string) {
    this.mcpUrl = url;
    this.refresh();
  }

  public updateIndexedRepositories(repositories: string[]) {
    this.indexedRepositories = repositories;
    this.refresh();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data) => {
      switch (data.type) {
        case "runCommand":
          const args = Array.isArray(data.args)
            ? data.args
            : data.args !== undefined
            ? [data.args]
            : [];
          vscode.commands.executeCommand(data.command, ...args);
          break;
        case "copyToClipboard":
          if (typeof data.text === "string" && data.text.length) {
            vscode.env.clipboard.writeText(data.text);
            vscode.window.setStatusBarMessage("Chatrat: MCP URL copied", 2000);
          }
          break;
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Show different UI based on state
    const showGettingStarted =
      !this.isAuthenticated || !this.hasIndexedCurrentRepository;

    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chatrat</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    padding: 16px;
                    margin: 0;
                }
                h1 {
                    font-size: 1.5em;
                    margin-bottom: 16px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .emoji {
                    font-size: 1.2em;
                }
                h2 {
                    font-size: 1.2em;
                    margin-top: 24px;
                    margin-bottom: 12px;
                    color: var(--vscode-textLink-foreground);
                }
                .getting-started {
                    background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-focusBorder) 100%);
                    color: var(--vscode-editor-background);
                    padding: 20px;
                    border-radius: 8px;
                    margin-bottom: 20px;
                    text-align: center;
                }
                .getting-started h2 {
                    color: var(--vscode-editor-background);
                    margin: 0 0 10px 0;
                }
                .getting-started p {
                    color: var(--vscode-editor-background);
                }
                .step-indicator {
                    display: flex;
                    justify-content: center;
                    gap: 8px;
                    margin: 20px 0;
                }
                .step {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: var(--vscode-editor-background);
                    color: var(--vscode-foreground);
                    font-weight: bold;
                    opacity: 0.5;
                    position: relative;
                }
                .step.completed {
                    opacity: 1;
                    background: var(--vscode-testing-iconPassed, var(--vscode-button-background));
                    color: var(--vscode-button-foreground);
                }
                .step.completed::after {
                    content: '✓';
                    position: absolute;
                    font-size: 1.2em;
                }
                .step.completed span {
                    display: none;
                }
                .step.active {
                    opacity: 1;
                    animation: pulse 2s infinite;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); }
                }
                .primary-button {
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 10px 20px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    margin: 10px 0;
                    font-weight: 500;
                }
                .primary-button:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .command-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }
                .command-item {
                    margin-bottom: 12px;
                    padding: 12px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    border-radius: 4px;
                    cursor: pointer;
                    transition: background-color 0.2s;
                }
                .command-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .command-item.disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .command-item.disabled:hover {
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                }
                .command-title {
                    font-weight: bold;
                    margin-bottom: 4px;
                }
                .command-desc {
                    font-size: 0.9em;
                    opacity: 0.8;
                }
                .section {
                    margin-bottom: 24px;
                }
                .info-box {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 3px solid var(--vscode-textLink-foreground);
                    padding: 12px;
                    margin: 12px 0;
                }
                .success-box {
                    background-color: var(--vscode-textBlockQuote-background);
                    border-left: 3px solid var(--vscode-testing-iconPassed, var(--vscode-button-background));
                    padding: 12px;
                    margin: 12px 0;
                }
                .steps {
                    counter-reset: step-counter;
                    list-style: none;
                    padding: 0;
                }
                .steps li {
                    counter-increment: step-counter;
                    margin-bottom: 12px;
                    padding-left: 28px;
                    position: relative;
                }
                .steps li::before {
                    content: counter(step-counter);
                    position: absolute;
                    left: 0;
                    top: 0;
                    background-color: var(--vscode-textLink-foreground);
                    color: var(--vscode-editor-background);
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 0.8em;
                    font-weight: bold;
                }
                code {
                    background-color: var(--vscode-textCodeBlock-background);
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-family: var(--vscode-editor-font-family);
                }
                .status-badge {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 0.6em;
                    font-weight: 500;
                    margin-left: 8px;
                }
                .status-badge.authenticated {
                    background: #4ec9b0;
                    color: var(--vscode-editor-background);
                }
                .status-badge.indexed {
                    background: var(--vscode-textLink-foreground);
                    color: var(--vscode-editor-background);
                }
                .mcp-box {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background-color: var(--vscode-editor-inactiveSelectionBackground);
                    padding: 8px 10px;
                    border-radius: 6px;
                    margin-top: 8px;
                    word-break: break-all;
                }
                .mcp-link {
                    flex: 1;
                    font-family: var(--vscode-editor-font-family);
                    font-size: 0.9em;
                }
            </style>
        </head>
        <body>
            <h1>
                <span class="emoji" style="white-space: nowrap;"><span style="letter-spacing: 0.2em;">💬</span>🐀</span> Chatrat
            </h1>
            
            ${
              showGettingStarted
                ? `
            <div class="getting-started">
                <h2>🚀 Getting Started</h2>
                <div class="step-indicator">
                    <div class="step ${
                      this.isAuthenticated ? "completed" : "active"
                    }">
                        <span>1</span>
                    </div>
                    <div class="step ${
                      this.hasIndexedCurrentRepository
                        ? "completed"
                        : this.isAuthenticated
                        ? "active"
                        : ""
                    }">
                        <span>2</span>
                    </div>
                    <div class="step ${
                      this.hasIndexedCurrentRepository ? "active" : ""
                    }">
                        <span>3</span>
                    </div>
                </div>
                <div>
                    ${
                      !this.isAuthenticated
                        ? `
                        <p><strong>Step 1: Authenticate with GitHub</strong></p>
                        <p style="font-size: 0.9em; opacity: 0.9; margin: 8px 0;">Sign in to secure your workspace data</p>
                        <button class="primary-button" onclick="runCommand('chatrat.authenticate')">
                            🔐 Sign in with GitHub
                        </button>
                    `
                        : !this.hasIndexedCurrentRepository
                        ? `
                        <p><strong>Step 2: Index This Workspace</strong></p>
                        <p style="font-size: 0.9em; opacity: 0.9; margin: 8px 0;">Securely scan and store your workspace for use with MCP</p>
                        <button class="primary-button" onclick="runCommand('chatrat.captureAndSend')">
                            📦 Index Current Workspace
                        </button>
                    `
                        : `
                         <p><strong>Step 3: Connect to Claude</strong></p>
                        <p style="font-size: 0.9em; opacity: 0.9; margin: 8px 0;">Copy your unique MCP URL for Claude Desktop</p>
                        <div class="mcp-box">
                            <code class="mcp-link" id="mcpUrlText">${
                              this.mcpUrl ||
                              "— will appear here after indexing —"
                            }</code>
                            <button class="primary-button" onclick="copyMcpUrl()">Copy</button>
                        </div>
                    `
                    }
                </div>
            </div>
            `
                : `
            <div class="success-box">
                    <strong>✅ Ready!</strong> Your workspace is indexed and ready for use with Claude/MCP.
                <div class="mcp-box" style="margin-top: 10px;">
                    <code class="mcp-link" id="mcpUrlText">${
                      this.mcpUrl || "— will appear here after indexing —"
                    }</code>
                    <button class="primary-button" onclick="copyMcpUrl()">Copy</button>
                </div>
            </div>
            `
            }

            ${
              this.isAuthenticated && this.indexedRepositories.length > 0
                ? `
            <div class="section">
                <h2>📚 Indexed Repositories</h2>
                <div class="info-box">
                    <p><strong>${this.indexedRepositories.length} workspace${
                    this.indexedRepositories.length === 1 ? "" : "ies"
                  } indexed:</strong></p>
                    <ul style="margin: 8px 0; padding-left: 20px;">
                        ${this.indexedRepositories
                          .map((repo) => `<li><code>${repo}</code></li>`)
                          .join("")}
                    </ul>
                    <p style="margin-top: 8px; font-size: 0.9em; opacity: 0.8;">
                        These repositories are available for MCP access. 
                    </p>
                </div>
            </div>
            `
                : ""
            }

            <div class="section">
                <h2>🚀 Commands</h2>
                <ul class="command-list">
                    <li class="command-item ${
                      !this.isAuthenticated ? "disabled" : ""
                    }" 
                        onclick="${
                          this.isAuthenticated
                            ? "runCommand('chatrat.captureAndSend')"
                            : ""
                        }">
                        <div class="command-title">📦 Index workspace</div>
                        <div class="command-desc">
                            ${
                              !this.isAuthenticated
                                ? "Sign in first to index workspace"
                                : "Index the current workspace"
                            }
                        </div>
                    </li>
                    <li class="command-item ${
                      !this.isAuthenticated ? "disabled" : ""
                    }" 
                        onclick="${
                          this.isAuthenticated
                            ? "runCommand('chatrat.listStoredRepositories')"
                            : ""
                        }">
                        <div class="command-title">📋 List Indexed Repositories</div>
                        <div class="command-desc">
                            ${
                              !this.isAuthenticated
                                ? "Sign in first to view repositories"
                                : "View all indexed repositories"
                            }
                        </div>
                    </li>
                    ${
                      this.isAuthenticated
                        ? ""
                        : `
                    <li class="command-item" onclick="runCommand('chatrat.authenticate')">
                        <div class="command-title">🔐 ${
                          this.isAuthenticated
                            ? "Re-authenticate"
                            : "Authenticate"
                        }</div>
                        <div class="command-desc">
                            ${
                              this.isAuthenticated
                                ? "Sign in with a different GitHub account"
                                : "Sign in with GitHub to enable all features"
                            }
                        </div>
                    </li>
                    `
                    }
                    ${
                      this.isAuthenticated
                        ? `
                    <li class="command-item" onclick="runCommand('chatrat.clearDatabase')">
                        <div class="command-title">🗑️ Clear Database</div>
                        <div class="command-desc">Delete all indexed workspace data</div>
                    </li>
                    <li class="command-item" onclick="runCommand('chatrat.logout')">
                        <div class="command-title">🚪 Logout</div>
                        <div class="command-desc">Sign out from GitHub</div>
                    </li>
                    `
                        : ""
                    }
                </ul>
            </div>

            <div class="section">
                <h2>📖 How Chatrat Works</h2>
                <ol class="steps">
                    <li><strong>Authenticate:</strong> Sign in with GitHub to secure your data</li>
                    <li><strong>Index Your Code:</strong> Chatrat indexes your codebase for use with MCP</li>
                    <li><strong>Get MCP URL:</strong> A unique URL is automaticalyl generated that connects Claude or another MCP client to your indexed code</li>
                    <li><strong>Configure Claude:</strong> Add the MCP URL to Claude Desktop's configuration</li>
                    <li><strong>Chat with Context:</strong>Once you tell Claude what workspace you're working in, it will be able to (1) reference file contents and (2) know what files you have open and the errors in them!</li>
                </ol>
            </div>

            <div class="section">
                <h2>⚙️ Configuration</h2>
                <div class="info-box">
                    <p><strong>Auto-capture:</strong> Enable automatic indexing when opening workspaces</p>
                    <p><strong>Exclude Patterns:</strong> Customize which files to ignore (node_modules, .git, etc.)</p>
                    <p><strong>Max File Size:</strong> Set the maximum file size to index (default: 1MB)</p>
                    <p style="margin-top: 8px;">
                        <a href="#" onclick="runCommand('workbench.action.openSettings', 'chatrat'); return false;">Open Settings →</a>
                    </p>
                </div>
            </div>

 
            <div class="section">
                <h2>😸 Say hello</h2>
                <p>If you have any questions or feedback, please contact us at <a href="mailto:grep@chatrat.cat">grep@chatrat.cat</a></p>
                <p>Join the community: <a href="https://discord.gg/chatrat">Discord</a></p>
                <p>Want to contribute? Visit us on <a href="https://github.com/alexjamesgodfrey/chatrat">GitHub</a></p>
                <p>www: <a href="https://chatrat.cat">chatrat.cat</a></p>
                <p>By proceeding, you agree to the <a href="https://chatrat.cat/terms">Terms of Service</a> and <a href="https://chatrat.cat/privacy">Privacy Policy</a></p>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                
                function runCommand(command, args) {
                    vscode.postMessage({
                        type: 'runCommand',
                        command: command,
                        args: args
                    });
                }
                function copyMcpUrl() {
                    const el = document.getElementById('mcpUrlText') || document.getElementById('mcpUrlInline');
                    if (!el) return;
                    const text = el.textContent || '';
                    if (!text || text.startsWith('—') || text.startsWith('Index')) return;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).catch(() => {
                            vscode.postMessage({ type: 'copyToClipboard', text });
                        });
                    } else {
                        vscode.postMessage({ type: 'copyToClipboard', text });
                    }
                }
            </script>
        </body>
        </html>`;
  }
}
