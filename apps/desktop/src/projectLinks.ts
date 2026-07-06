import {
  fetchAzureDevOpsRemoteSuggestionFromDaemon,
  fetchGitBranchesFromDaemon,
  type AdoDiscoveryKind,
  type AdoDiscoveryOption,
  type AzureDevOpsRemoteSuggestion,
  type ProjectLink,
  type ProjectLinkInput,
} from "./api";

export const DEFAULT_ADO_ORG_URL = "https://tebssg.visualstudio.com/";
export const ACTIVE_PROJECT_LINK_LS_KEY = "mergepilot_active_project_link_id";

function browserStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

export function loadStoredActiveProjectLinkId(): string {
  const storage = browserStorage();
  if (!storage) return "";
  try {
    return storage.getItem(ACTIVE_PROJECT_LINK_LS_KEY) || "";
  } catch {
    return "";
  }
}

export function saveStoredActiveProjectLinkId(projectLinkId: string | null | undefined): void {
  const storage = browserStorage();
  if (!storage) return;
  try {
    const normalized = projectLinkId?.trim() ?? "";
    if (normalized) {
      storage.setItem(ACTIVE_PROJECT_LINK_LS_KEY, normalized);
      return;
    }
    storage.removeItem(ACTIVE_PROJECT_LINK_LS_KEY);
  } catch {
    /* localStorage can be unavailable in restricted browser contexts */
  }
}

export function resolveActiveProjectLinkId(
  projectLinks: ProjectLink[],
  currentId?: string | null,
): string {
  const current = currentId?.trim() ?? "";
  if (current && projectLinks.some((projectLink) => projectLink.id === current)) return current;

  const stored = loadStoredActiveProjectLinkId();
  if (stored && projectLinks.some((projectLink) => projectLink.id === stored)) return stored;

  return projectLinks[0]?.id ?? "";
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

export async function fetchAzureDevOpsRemoteSuggestion(
  repoPath: string,
): Promise<AzureDevOpsRemoteSuggestion | null> {
  if (!repoPath.trim()) return null;
  return fetchAzureDevOpsRemoteSuggestionFromDaemon(repoPath.trim());
}

export function projectLinkNameFromRepo(repoPath: string): string {
  const repoName = repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  return repoName ? `${repoName} link` : "Project link";
}

export function shouldRefreshGeneratedProjectLinkName(currentName: string, previousRepoPath: string): boolean {
  const previousGeneratedName = projectLinkNameFromRepo(previousRepoPath);
  return !currentName.trim() || currentName === "Project link" || currentName === previousGeneratedName;
}

export function applyAzureDevOpsRemoteSuggestion(
  form: ProjectLinkInput,
  remote: AzureDevOpsRemoteSuggestion,
): ProjectLinkInput {
  return {
    ...form,
    adoOrgUrl:
      !form.adoOrgUrl.trim() || form.adoOrgUrl.trim() === DEFAULT_ADO_ORG_URL
        ? remote.adoOrgUrl
        : form.adoOrgUrl,
    adoProject: form.adoProject.trim() ? form.adoProject : remote.adoProject,
    adoRepoName: form.adoRepoName.trim() ? form.adoRepoName : remote.adoRepoName,
  };
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function exactRepositoryMatchScore(pipeline: AdoDiscoveryOption, repo: string): number {
  if (!repo) return 0;
  const expectedRepo = normalizeToken(repo);
  const fields = [
    pipeline.description.match(/\brepo:([^·|\n\r]+)/i)?.[1] ?? "",
    pipeline.name,
  ];
  return fields.some((field) => normalizeToken(field) === expectedRepo) ? 12 : 0;
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

  const scored = pipelines
    .map((pipeline) => {
      const haystack = normalizeToken(`${pipeline.name} ${pipeline.description} ${pipeline.url}`);
      let score = exactRepositoryMatchScore(pipeline, repo);
      if (repo && haystack.includes(repo)) score += 6;
      if (project && haystack.includes(project)) score += 2;
      if (/\b(ci|build|pr|pull request|validation|verify)\b/.test(haystack)) score += 3;
      if (haystack.includes("azure pipelines") || haystack.includes("azure-pipelines")) score += 2;
      if (haystack.includes("release") || haystack.includes("deploy") || haystack.includes("prod"))
        score -= 3;
      return { pipeline, score };
    })
    .sort((a, b) => b.score - a.score || a.pipeline.name.localeCompare(b.pipeline.name));

  return scored[0]?.pipeline ?? null;
}

export function adoDiscoverySignature(kind: AdoDiscoveryKind, form: ProjectLinkInput): string {
  return JSON.stringify({
    kind,
    org: form.adoOrgUrl.trim(),
    project: form.adoProject.trim(),
    repo: form.adoRepoName.trim(),
  });
}

export function applyAdoDiscoveryToProjectLinkInput(
  form: ProjectLinkInput,
  kind: AdoDiscoveryKind,
  option: AdoDiscoveryOption,
): ProjectLinkInput {
  if (kind === "projects") {
    return {
      ...form,
      adoProject: option.name,
      adoRepoName: form.adoProject === option.name ? form.adoRepoName : "",
    };
  }
  if (kind === "repositories") {
    return {
      ...form,
      adoRepoName: option.name,
    };
  }
  if (kind === "pipelines") {
    return {
      ...form,
      adoPipelineId: option.id,
      adoPipelineName: option.name,
    };
  }
  return form;
}

export function withProjectLinkInputDefaults<T extends Partial<ProjectLinkInput>>(
  link: T,
): T & ProjectLinkInput {
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
    projectTemplate: "",
    buildCommand: "",
    testCommand: "",
    ...link,
  };
}

export function withoutProjectLinkFallbacks<T extends ProjectLinkInput>(link: T): T {
  return {
    ...link,
    adoPat: "",
    adoMcpEnabled: false,
    adoMcpCommand: "",
    adoMcpAuthentication: "",
    adoMcpDomains: "repositories,pipelines,work-items",
  };
}

export function withProjectLinkDefaults<T extends Partial<ProjectLink>>(link: T): T & ProjectLink {
  const withInput = withProjectLinkInputDefaults(link);
  return {
    ...withInput,
    id: typeof link.id === "string" ? link.id : "",
    createdAt: typeof link.createdAt === "number" ? link.createdAt : 0,
    updatedAt: typeof link.updatedAt === "number" ? link.updatedAt : 0,
  };
}
