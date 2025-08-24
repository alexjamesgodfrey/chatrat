import { GitHubUser } from "../types";

export function getUserDbName(githubUser: GitHubUser): string {
  const base = "repo-context";
  const safeUser = githubUser.login.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return `${base}-${safeUser || "unknown"}`.slice(0, 32);
}
