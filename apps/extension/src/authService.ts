/**
 * Auth service using the built-in VSCode authentication provider for GitHub
 * instead of the custom server-based flow.
 */

import * as vscode from "vscode";
import axios from "axios";

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
  dbProviderType: string;
  connectionString?: string;
}

export class AuthService {
  private static instance: AuthService;
  private context: vscode.ExtensionContext;
  private authSession?: vscode.AuthenticationSession = undefined;
  private authState: AuthState = {
    isAuthenticated: false,
    dbProviderType: "agentdb",
  };
  private isDatabaseSeeded: boolean = false;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.initialize();
  }

  public static getInstance(context?: vscode.ExtensionContext): AuthService {
    if (!AuthService.instance && context) {
      AuthService.instance = new AuthService(context);
    }
    return AuthService.instance;
  }

  public async initialize(): Promise<void> {
    try {
      this.authSession = await vscode.authentication.getSession(
        "github",
        ["user:email"],
        { createIfNone: false }
      );

      if (this.authSession) {
        // Fetch user info from GitHub API using the session token
        await this.updateAuthState();
      } else {
        this.authState = { isAuthenticated: false, dbProviderType: "agentdb" };
      }
    } catch (error) {
      this.authState = { isAuthenticated: false, dbProviderType: "agentdb" };
    }
  }

  private async updateAuthState(): Promise<void> {
    if (!this.authSession) {
      this.authState = { isAuthenticated: false, dbProviderType: "agentdb" };
      return;
    }

    try {
      // Use the VSCode session token to get user info from GitHub
      const response = await axios.get("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${this.authSession.accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      const user: GitHubUser = {
        id: response.data.id,
        login: response.data.login,
        name: response.data.name || response.data.login,
        email: response.data.email || "",
      };

      this.authState = {
        isAuthenticated: true,
        user,
        token: this.authSession.accessToken,
        dbProviderType: "agentdb",
      };
    } catch (error) {
      this.authState = { isAuthenticated: false, dbProviderType: "agentdb" };
      this.authSession = undefined;
    }
  }

  public async authenticate(): Promise<boolean> {
    try {
      vscode.window.showInformationMessage("Starting GitHub authentication...");

      this.authSession = await vscode.authentication.getSession(
        "github",
        ["user:email"],
        { createIfNone: true }
      );

      if (this.authSession) {
        vscode.window.showInformationMessage(
          `Got auth session for: ${this.authSession.account.label}`
        );

        await this.updateAuthState();
        if (this.authState.isAuthenticated) {
          // Show detailed success message
          vscode.window.showInformationMessage(
            `✅ Successfully authenticated as ${
              this.authState.user?.name || this.authState.user?.login
            }! ` +
              `(ID: ${this.authState.user?.id}, Token length: ${this.authState.token?.length})`
          );
          return true;
        }
      }

      vscode.window.showErrorMessage(
        "Authentication failed - no session created"
      );
      return false;
    } catch (error) {
      console.error("❌ Authentication error:", error);
      vscode.window.showErrorMessage(`Authentication error: ${error}`);
      return false;
    }
  }

  public async logout(): Promise<void> {
    try {
      // Clear the VSCode authentication session
      if (this.authSession) {
        // Note: VSCode doesn't provide a direct way to logout a specific session
        // The user will need to manage this through VSCode's account settings
        vscode.window
          .showInformationMessage(
            "To fully logout, please remove the GitHub account from VSCode's account settings.",
            "Open Account Settings"
          )
          .then((selection) => {
            if (selection === "Open Account Settings") {
              vscode.commands.executeCommand("workbench.action.manageAccounts");
            }
          });
      }

      // Clear local state
      this.authSession = undefined;
      this.authState = { isAuthenticated: false, dbProviderType: "agentdb" };

      vscode.window.showInformationMessage("Successfully logged out locally");
    } catch (error) {
      console.error("Logout error:", error);
      // Still clear local state even if there's an error
      this.authSession = undefined;
      this.authState = { isAuthenticated: false, dbProviderType: "agentdb" };
    }
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

  public setIsDatabaseSeeded(isSeeded: boolean): void {
    this.isDatabaseSeeded = isSeeded;
  }

  public getIsDatabaseSeeded(): boolean {
    return this.isDatabaseSeeded;
  }

  // Compatibility method for the URI handler (not needed for VSCode auth but kept for interface compatibility)
  public async handleAuthCallback(uri: vscode.Uri): Promise<void> {
    // This method is not needed for VSCode's built-in auth but kept for compatibility
    return;
  }

  // Debug method to show current auth state
  public showAuthStatus(): void {
    const state = this.getAuthState();
    if (state.isAuthenticated && state.user) {
      vscode.window.showInformationMessage(
        `🔐 Currently authenticated as: ${
          state.user.name || state.user.login
        } ` + `(ID: ${state.user.id}, Email: ${state.user.email || "N/A"})`
      );
    } else {
      vscode.window.showWarningMessage("❌ Not currently authenticated");
    }
  }
}
