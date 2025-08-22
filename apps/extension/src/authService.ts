import axios from "axios";
import * as vscode from "vscode";

export interface GitHubUser {
  id: number;
  login: string;
  name: string;
  email: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user?: GitHubUser;
  token?: string;
}

export class AuthService {
  private static instance: AuthService;
  private context: vscode.ExtensionContext;
  private serverBaseUrl: string;
  private authState: AuthState = { isAuthenticated: false };
  private authCallbackResolve: ((value: boolean) => void) | null = null;
  private authCallbackTimeout: NodeJS.Timeout | null = null;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.serverBaseUrl = this.getServerBaseUrl();
  }

  public static getInstance(context?: vscode.ExtensionContext): AuthService {
    if (!AuthService.instance && context) {
      AuthService.instance = new AuthService(context);
    }
    return AuthService.instance;
  }

  private getServerBaseUrl(): string {
    const config = vscode.workspace.getConfiguration("repoContextCapture");
    return config.get<string>("serverBaseUrl") || "http://localhost:3000";
  }

  public async initialize(): Promise<void> {
    // Check if we have stored authentication
    const storedToken = await this.context.globalState.get<string>(
      "githubToken"
    );
    const storedUser = await this.context.globalState.get<GitHubUser>(
      "githubUser"
    );

    if (storedToken && storedUser) {
      // Verify the token is still valid
      try {
        const isValid = await this.verifyToken(storedToken);
        if (isValid) {
          this.authState = {
            isAuthenticated: true,
            user: storedUser,
            token: storedToken,
          };
          console.log("Restored authentication for user:", storedUser.login);
          return;
        }
      } catch (error) {
        console.log("Stored token is invalid, clearing...");
        await this.clearStoredAuth();
      }
    }

    // No valid authentication found
    this.authState = { isAuthenticated: false };
  }

  private async verifyToken(token: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.serverBaseUrl}/auth/status`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 5000,
      });
      return response.data.authenticated === true;
    } catch (error) {
      return false;
    }
  }

  public async authenticate(): Promise<boolean> {
    try {
      // Show authentication prompt
      const result = await vscode.window.showInformationMessage(
        "GitHub authentication is required to use this extension.",
        { modal: true },
        "Authenticate with GitHub",
        "Cancel"
      );

      if (result !== "Authenticate with GitHub") {
        return false;
      }

      // Open GitHub OAuth flow in browser
      const authUrl = `${this.serverBaseUrl}/auth/github`;
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));

      // Show progress and wait for callback
      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Waiting for GitHub authentication...",
          cancellable: true,
        },
        async (progress, token) => {
          progress.report({
            message: "Please complete authentication in your browser",
          });

          // Create a promise that will be resolved by handleAuthCallback
          return new Promise<boolean>((resolve) => {
            // Store the resolve function so handleAuthCallback can use it
            this.authCallbackResolve = resolve;

            // Set a timeout
            this.authCallbackTimeout = setTimeout(() => {
              this.cleanupAuthCallback();
              resolve(false);
              vscode.window.showWarningMessage(
                "Authentication timed out. Please try again."
              );
            }, 120000); // 2 minutes timeout

            // Handle cancellation
            token.onCancellationRequested(() => {
              this.cleanupAuthCallback();
              resolve(false);
            });
          });
        }
      );
    } catch (error) {
      console.error("Authentication error:", error);
      vscode.window.showErrorMessage(`Authentication failed: ${error}`);
      return false;
    }
  }

  // This method is called by the centralized URI handler in extension.ts
  public async handleAuthCallback(uri: vscode.Uri): Promise<void> {
    if (!this.authCallbackResolve) {
      console.log("Received auth callback but not waiting for one");
      return;
    }

    try {
      const params = new URLSearchParams(uri.query);
      const authToken = params.get("token");
      const userJson = params.get("user");

      if (authToken && userJson) {
        const user: GitHubUser = JSON.parse(decodeURIComponent(userJson));

        // Store the GitHub token - we'll use it for authentication with your server
        await this.storeAuth(authToken, user);

        this.authState = {
          isAuthenticated: true,
          user,
          token: authToken, // Keep the token here
        };

        vscode.window.showInformationMessage(
          `Successfully authenticated as ${user.name || user.login}!`
        );

        this.authCallbackResolve(true);
      } else {
        this.authCallbackResolve(false);
        vscode.window.showErrorMessage(
          "Authentication failed: Invalid response from server"
        );
      }
    } catch (error) {
      console.error("Auth callback error:", error);
      this.authCallbackResolve(false);
      vscode.window.showErrorMessage(`Authentication failed: ${error}`);
    } finally {
      this.cleanupAuthCallback();
    }
  }

  private cleanupAuthCallback(): void {
    this.authCallbackResolve = null;
    if (this.authCallbackTimeout) {
      clearTimeout(this.authCallbackTimeout);
      this.authCallbackTimeout = null;
    }
  }

  private async storeAuth(token: string, user: GitHubUser): Promise<void> {
    await this.context.globalState.update("githubToken", token);
    await this.context.globalState.update("githubUser", user);
  }

  private async clearStoredAuth(): Promise<void> {
    await this.context.globalState.update("githubToken", undefined);
    await this.context.globalState.update("githubUser", undefined);
  }

  public async logout(): Promise<void> {
    try {
      // Call server logout endpoint
      if (this.authState.token) {
        await axios.post(
          `${this.serverBaseUrl}/auth/logout`,
          {},
          {
            headers: {
              Authorization: `Bearer ${this.authState.token}`,
            },
          }
        );
      }
    } catch (error) {
      console.log("Server logout failed, continuing with local logout");
    }

    // Clear local state
    await this.clearStoredAuth();
    this.authState = { isAuthenticated: false };

    vscode.window.showInformationMessage("Successfully logged out");
  }

  public getAuthState(): AuthState {
    return { ...this.authState };
  }

  public isAuthenticated(): boolean {
    return this.authState.isAuthenticated;
  }

  public getToken(): string | undefined {
    return this.authState.token;
  }

  public getUser(): GitHubUser | undefined {
    return this.authState.user;
  }
}
