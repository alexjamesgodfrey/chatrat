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
}

export class AuthService {
    private static instance: AuthService;
    private context: vscode.ExtensionContext;
    private authSession?: vscode.AuthenticationSession = undefined;
    private authState: AuthState = { isAuthenticated: false };

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
                console.log("Restored authentication for user:", this.authState.user?.login);
            } else {
                this.authState = { isAuthenticated: false };
            }
        } catch (error) {
            console.log("No existing auth session found");
            this.authState = { isAuthenticated: false };
        }
    }

    private async updateAuthState(): Promise<void> {
        if (!this.authSession) {
            console.log("❌ No auth session available");
            this.authState = { isAuthenticated: false };
            return;
        }

        try {
            console.log("🔍 Fetching user info from GitHub API...");
            // Use the VSCode session token to get user info from GitHub
            const response = await axios.get("https://api.github.com/user", {
                headers: {
                    Authorization: `Bearer ${this.authSession.accessToken}`,
                    Accept: "application/vnd.github.v3+json",
                },
            });

            console.log("📋 GitHub API response:", {
                id: response.data.id,
                login: response.data.login,
                name: response.data.name,
                email: response.data.email
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
            };

            console.log("✅ Auth state updated successfully");
        } catch (error) {
            console.error("❌ Failed to fetch user info:", error);
            this.authState = { isAuthenticated: false };
            this.authSession = undefined;
        }
    }

    public async authenticate(): Promise<boolean> {
        try {
            console.log("🔐 Starting VSCode GitHub authentication...");
            vscode.window.showInformationMessage("Starting GitHub authentication...");

            this.authSession = await vscode.authentication.getSession(
                "github",
                ["user:email"],
                { createIfNone: true }
            );

            if (this.authSession) {
                console.log("✅ Got VSCode auth session:", {
                    id: this.authSession.id,
                    account: this.authSession.account.label,
                    scopes: this.authSession.scopes
                });

                vscode.window.showInformationMessage(`Got auth session for: ${this.authSession.account.label}`);

                await this.updateAuthState();
                if (this.authState.isAuthenticated) {
                    console.log("🎉 Authentication successful! User info:", {
                        login: this.authState.user?.login,
                        name: this.authState.user?.name,
                        email: this.authState.user?.email,
                        id: this.authState.user?.id,
                        tokenLength: this.authState.token?.length
                    });

                    // Show detailed success message
                    vscode.window.showInformationMessage(
                        `✅ Successfully authenticated as ${this.authState.user?.name || this.authState.user?.login}! ` +
                        `(ID: ${this.authState.user?.id}, Token length: ${this.authState.token?.length})`
                    );
                    return true;
                }
            }
            console.log("❌ Authentication failed - no session or auth state not updated");
            vscode.window.showErrorMessage("Authentication failed - no session created");
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
                vscode.window.showInformationMessage(
                    "To fully logout, please remove the GitHub account from VSCode's account settings.",
                    "Open Account Settings"
                ).then((selection) => {
                    if (selection === "Open Account Settings") {
                        vscode.commands.executeCommand("workbench.action.manageAccounts");
                    }
                });
            }

            // Clear local state
            this.authSession = undefined;
            this.authState = { isAuthenticated: false };

            vscode.window.showInformationMessage("Successfully logged out locally");
        } catch (error) {
            console.error("Logout error:", error);
            // Still clear local state even if there's an error
            this.authSession = undefined;
            this.authState = { isAuthenticated: false };
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

    // Compatibility method for the URI handler (not needed for VSCode auth but kept for interface compatibility)
    public async handleAuthCallback(uri: vscode.Uri): Promise<void> {
        // This method is not needed for VSCode's built-in auth but kept for compatibility
        console.log("handleAuthCallback called but not needed for VSCode auth:", uri.toString());
    }

    // Debug method to show current auth state
    public showAuthStatus(): void {
        const state = this.getAuthState();
        if (state.isAuthenticated && state.user) {
            vscode.window.showInformationMessage(
                `🔐 Currently authenticated as: ${state.user.name || state.user.login} ` +
                `(ID: ${state.user.id}, Email: ${state.user.email || 'N/A'})`
            );
            console.log("Current auth state:", state);
        } else {
            vscode.window.showWarningMessage("❌ Not currently authenticated");
            console.log("Not authenticated");
        }
    }
}