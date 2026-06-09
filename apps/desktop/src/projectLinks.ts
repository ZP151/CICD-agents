import { fetchGitBranchesFromDaemon } from "./api";

export type PatStatus = "none" | "pending" | "verified" | "invalid";

// In a Tauri context we invoke the native Rust command first (it uses cmd /c on
// Windows so it sees the user's full PATH). We fall back to the daemon HTTP API
// for browser-based dev mode or if the Tauri command returns nothing.
export async function fetchGitBranches(repoPath: string): Promise<string[]> {
  if (!repoPath.trim()) return [];

  if (typeof window !== "undefined" && "__TAURI__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const branches = await invoke<string[]>("list_git_branches", { repoPath: repoPath.trim() });
      if (branches.length > 0) return branches;
    } catch {
      /* fall through */
    }
  }

  return fetchGitBranchesFromDaemon(repoPath);
}

export async function verifyPat(orgUrl: string, pat: string): Promise<boolean> {
  if (!orgUrl || !pat) return false;
  try {
    const base = orgUrl.replace(/\/$/, "");
    const r = await fetch(`${base}/_apis/projects?api-version=7.1&$top=1`, {
      redirect: "manual",
      headers: { Authorization: `Basic ${btoa(`:${pat}`)}` },
    });
    if (r.status === 301 || r.status === 302 || r.status === 303 || r.status === 307 || r.status === 308) {
      return false;
    }
    return r.ok;
  } catch {
    return false;
  }
}

export function projectLinkNameFromRepo(repoPath: string): string {
  const repoName = repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  return repoName ? `${repoName} link` : "Project link";
}
