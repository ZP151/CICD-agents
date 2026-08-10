import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface ProjectLink {
  /** Stable UUID hex identifier */
  id: string;
  /** Human-readable display name */
  name: string;
  createdAt: number;
  updatedAt: number;

  // Local repository
  repoPath: string;
  defaultBranch: string;
  targetBranch: string;

  // Azure DevOps connection (stored per Project Link; PAT never written to YAML)
  adoOrgUrl: string;
  adoProject: string;
  adoRepoName: string;
  // Runtime-only credential reference (ADR-0005): persisted stores always
  // hold the empty placeholder; the value is injected per request from Key
  // Vault, the OS keyring, or the request payload — never read from disk.
  adoPat: string;
  adoPipelineId: string;
  adoPipelineName: string;

  // Optional Azure DevOps MCP bridge. Disabled by default.
  adoMcpEnabled: boolean;
  adoMcpCommand: string;
  adoMcpAuthentication: string;
  adoMcpDomains: string;

  // Optional reference to a YAML build/test project template.
  projectTemplate: string;

  // Build / test commands can override the template.
  buildCommand: string;
  testCommand: string;
}

export type ProjectLinkInput = Omit<ProjectLink, "id" | "createdAt" | "updatedAt">;

type ProjectLinkStore = Record<string, ProjectLink>;

// Branch policy is first-class Project Link configuration: it scopes local
// comparison and every proposed PR. The remaining workflow fields below are
// read-only compatibility values; writes do not persist them.
const LEGACY_READ_DEFAULTS = {
  defaultBranch: "",
  targetBranch: "",
  adoPat: "",
  adoPipelineId: "",
  adoPipelineName: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
} as const;

function withLegacyReadDefaults(projectLink: ProjectLink): ProjectLink {
  return { ...LEGACY_READ_DEFAULTS, ...projectLink };
}

/**
 * Canonical write guard (ADR-0005): preserves the stable identity and branch
 * policy, drops deprecated workflow fields, and always clears credentials.
 */
export function legacyFreeProjectLinkInput(
  data: ProjectLinkInput | Partial<ProjectLinkInput>,
): Partial<ProjectLinkInput> {
  const {
    adoPipelineId: _adoPipelineId,
    adoPipelineName: _adoPipelineName,
    adoPat: _adoPat,
    adoMcpEnabled: _adoMcpEnabled,
    adoMcpCommand: _adoMcpCommand,
    adoMcpAuthentication: _adoMcpAuthentication,
    adoMcpDomains: _adoMcpDomains,
    projectTemplate: _projectTemplate,
    buildCommand: _buildCommand,
    testCommand: _testCommand,
    ...persisted
  } = data;
  // Credential placeholder only — the value never reaches a store.
  return { ...persisted, adoPat: "" };
}

function normalizeProjectLink(projectLink: ProjectLink): ProjectLink {
  return withLegacyReadDefaults(projectLink);
}

function projectLinkStorePath(dataDir: string): string {
  return path.join(dataDir, "project-links.json");
}

function loadProjectLinkStore(dataDir: string): ProjectLinkStore {
  const storePath = projectLinkStorePath(dataDir);
  if (!fs.existsSync(storePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8")) as ProjectLinkStore;
  } catch {
    return {};
  }
}

function saveProjectLinkStore(dataDir: string, store: ProjectLinkStore): void {
  const storePath = projectLinkStorePath(dataDir);
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), "utf8");
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** List all Project Links, newest-updated first. */
export function listProjectLinks(dataDir: string): ProjectLink[] {
  return Object.values(loadProjectLinkStore(dataDir))
    .map(normalizeProjectLink)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Get a single Project Link by id, or null if not found. */
export function getProjectLink(dataDir: string, id: string): ProjectLink | null {
  const projectLink = loadProjectLinkStore(dataDir)[id];
  return projectLink ? normalizeProjectLink(projectLink) : null;
}

/** Create a new Project Link and persist its identity and branch policy. */
export function createProjectLink(dataDir: string, data: ProjectLinkInput): ProjectLink {
  const store = loadProjectLinkStore(dataDir);
  const id = crypto.randomBytes(8).toString("hex");
  const ts = nowSec();
  const stored = {
    ...legacyFreeProjectLinkInput(data),
    id,
    createdAt: ts,
    updatedAt: ts,
  } as ProjectLink;
  store[id] = stored;
  saveProjectLinkStore(dataDir, store);
  return withLegacyReadDefaults(stored);
}

/**
 * Update an existing Project Link. Branch policy is editable; deprecated
 * workflow fields in the input remain ignored.
 */
export function updateProjectLink(
  dataDir: string,
  id: string,
  data: Partial<ProjectLinkInput>,
): ProjectLink | null {
  const store = loadProjectLinkStore(dataDir);
  const existing = store[id];
  if (!existing) return null;
  const updated: ProjectLink = {
    ...existing,
    ...legacyFreeProjectLinkInput(data),
    id,
    updatedAt: nowSec(),
  };
  store[id] = updated;
  saveProjectLinkStore(dataDir, store);
  return withLegacyReadDefaults(updated);
}

/** Delete a Project Link. Returns false if not found. */
export function deleteProjectLink(dataDir: string, id: string): boolean {
  const store = loadProjectLinkStore(dataDir);
  if (!store[id]) return false;
  delete store[id];
  saveProjectLinkStore(dataDir, store);
  return true;
}

/**
 * Build ToolContext extra fields from a Project Link so ADO tools receive
 * the correct org / project / repo / PAT automatically.
 */
export function projectLinkToToolExtra(projectLink: ProjectLink): Record<string, unknown> {
  const orgBase = projectLink.adoOrgUrl.replace(/\/$/, "");
  return {
    ado_org: orgBase,
    ado_project: projectLink.adoProject,
    ado_repository: projectLink.adoRepoName,
    ado_target_branch: projectLink.targetBranch,
    ado_pipeline_id: projectLink.adoPipelineId,
    ado_pipeline_name: projectLink.adoPipelineName,
    // Project Links can select a locally managed connector, but never supply
    // its executable command or credential. Those stay in the user's local
    // config.toml/.env and are resolved by the daemon at runtime.
    ado_mcp_enabled: projectLink.adoMcpEnabled,
    ado_mcp_domains: projectLink.adoMcpDomains,
  };
}
