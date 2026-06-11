import {
  fetchAzureDevOpsRemoteSuggestionFromDaemon,
  fetchGitBranchesFromDaemon,
  type AdoDiscoveryOption,
  type AzureDevOpsRemoteSuggestion,
  type WorkspaceProfile,
  type WorkspaceProfileInput,
} from "./api";

export type PatStatus = "none" | "pending" | "verified" | "invalid";

export const DEFAULT_ADO_ORG_URL = "https://tebssg.visualstudio.com/";
export const ACTIVE_PROJECT_LINK_LS_KEY = "cicd_agent_active_project_link_id";
const LEGACY_CHAT_PROFILE_LS_KEY = "chat_profile_id";

function browserStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function loadStoredActiveProjectLinkId(): string {
  const storage = browserStorage();
  if (!storage) return "";
  try {
    return storage.getItem(ACTIVE_PROJECT_LINK_LS_KEY) || storage.getItem(LEGACY_CHAT_PROFILE_LS_KEY) || "";
  } catch {
    return "";
  }
}

export function saveStoredActiveProjectLinkId(profileId: string | null | undefined): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    const normalized = profileId?.trim() ?? "";
    if (normalized) {
      storage.setItem(ACTIVE_PROJECT_LINK_LS_KEY, normalized);
      storage.setItem(LEGACY_CHAT_PROFILE_LS_KEY, normalized);
      return;
    }
    storage.removeItem(ACTIVE_PROJECT_LINK_LS_KEY);
    storage.removeItem(LEGACY_CHAT_PROFILE_LS_KEY);
  } catch {
    /* localStorage can be unavailable in restricted browser contexts */
  }
}

export function resolveActiveProjectLinkId(profiles: WorkspaceProfile[], currentId?: string | null): string {
  const current = currentId?.trim() ?? "";
  if (current && profiles.some((profile) => profile.id === current)) return current;

  const stored = loadStoredActiveProjectLinkId();
  if (stored && profiles.some((profile) => profile.id === stored)) return stored;

  return profiles[0]?.id ?? "";
}

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

export async function fetchAzureDevOpsRemoteSuggestion(repoPath: string): Promise<AzureDevOpsRemoteSuggestion | null> {
  if (!repoPath.trim()) return null;
  return fetchAzureDevOpsRemoteSuggestionFromDaemon(repoPath.trim());
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

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function pickRecommendedPipeline(
  pipelines: AdoDiscoveryOption[],
  context: { repoPath?: string; adoRepoName?: string; adoProject?: string },
): AdoDiscoveryOption | null {
  if (pipelines.length === 0) return null;
  if (pipelines.length === 1) return pipelines[0]!;

  const repoFromPath = context.repoPath?.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "";
  const repo = normalizeToken(context.adoRepoName || repoFromPath);
  const project = normalizeToken(context.adoProject ?? "");

  const scored = pipelines.map((pipeline) => {
    const haystack = normalizeToken(`${pipeline.name} ${pipeline.description} ${pipeline.url}`);
    let score = 0;
    if (repo && haystack.includes(repo)) score += 6;
    if (project && haystack.includes(project)) score += 2;
    if (/\b(ci|build|pr|pull request|validation|verify)\b/.test(haystack)) score += 3;
    if (haystack.includes("azure pipelines") || haystack.includes("azure-pipelines")) score += 2;
    if (haystack.includes("release") || haystack.includes("deploy") || haystack.includes("prod")) score -= 3;
    return { pipeline, score };
  }).sort((a, b) => b.score - a.score || a.pipeline.name.localeCompare(b.pipeline.name));

  return scored[0]?.pipeline ?? null;
}

export function withProjectLinkInputDefaults<T extends Partial<WorkspaceProfileInput>>(link: T): T & WorkspaceProfileInput {
  return {
    name: "",
    repoPath: "",
    defaultBranch: "main",
    targetBranch: "main",
    adoOrgUrl: DEFAULT_ADO_ORG_URL,
    adoProject: "",
    adoRepoName: "",
    adoPat: "",
    adoPipelineId: "",
    adoPipelineName: "",
    adoMcpEnabled: false,
    adoMcpCommand: "",
    adoMcpAuthentication: "",
    adoMcpDomains: "repositories,pipelines,work-items",
    templateProfile: "",
    buildCommand: "",
    testCommand: "",
    ...link,
  };
}

export function withProjectLinkDefaults<T extends Partial<WorkspaceProfile>>(link: T): T & WorkspaceProfile {
  const withInput = withProjectLinkInputDefaults(link);
  return {
    ...withInput,
    id: typeof link.id === "string" ? link.id : "",
    createdAt: typeof link.createdAt === "number" ? link.createdAt : 0,
    updatedAt: typeof link.updatedAt === "number" ? link.updatedAt : 0,
  };
}
