import * as vscode from "vscode";

export class ChatratViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "chatrat.sidebar";

  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {}

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
          vscode.commands.executeCommand(data.command);
          break;
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
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
            </style>
        </head>
        <body>
            <h1><span class="emoji">💬🐀</span> Chatrat</h1>
            
            <div class="section">
                <div class="info-box">
                    <strong>Quick Start:</strong> Click "Get MCP URL" below to generate your unique MCP connection URL, then add it to Claude Desktop's config.
                </div>
            </div>

            <div class="section">
                <h2>🚀 Commands</h2>
                <ul class="command-list">
                    <li class="command-item" onclick="runCommand('chatrat.getMcpUrl')">
                        <div class="command-title">📎 Get MCP URL</div>
                        <div class="command-desc">Generate and copy your MCP connection URL for Claude</div>
                    </li>
                    <li class="command-item" onclick="runCommand('chatrat.captureAndSend')">
                        <div class="command-title">📦 Index Repository</div>
                        <div class="command-desc">Capture and index the current workspace in AgentDB</div>
                    </li>
                    <li class="command-item" onclick="runCommand('chatrat.listStoredRepositories')">
                        <div class="command-title">📋 List Indexed Repositories</div>
                        <div class="command-desc">View all repositories stored in your database</div>
                    </li>
                    <li class="command-item" onclick="runCommand('chatrat.authenticate')">
                        <div class="command-title">🔐 Authenticate</div>
                        <div class="command-desc">Sign in with GitHub to enable all features</div>
                    </li>
                    <li class="command-item" onclick="runCommand('chatrat.clearDatabase')">
                        <div class="command-title">🗑️ Clear Database</div>
                        <div class="command-desc">Remove all indexed repository data</div>
                    </li>
                </ul>
            </div>

            <div class="section">
                <h2>📖 How Chatrat Works</h2>
                <ol class="steps">
                    <li><strong>Authenticate:</strong> Sign in with GitHub to secure your data</li>
                    <li><strong>Index Your Code:</strong> Chatrat scans your workspace and stores file contents in AgentDB</li>
                    <li><strong>Get MCP URL:</strong> Generate a unique URL that connects Claude to your indexed code</li>
                    <li><strong>Configure Claude:</strong> Add the MCP URL to Claude Desktop's configuration</li>
                    <li><strong>Chat with Context:</strong> Claude can now query and understand your entire codebase</li>
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
                <h2>🔧 Claude Desktop Setup</h2>
                <div class="info-box">
                    <p>After getting your MCP URL, add it to Claude Desktop's config:</p>
                    <p style="margin-top: 8px;"><code>~/Library/Application Support/Claude/claude_desktop_config.json</code></p>
                    <p style="margin-top: 8px;">The URL will look like: <code>https://mcp.sh/s/XXXXXX</code></p>
                </div>
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
            </script>
        </body>
        </html>`;
  }
}
