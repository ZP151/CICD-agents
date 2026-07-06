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

function normalizeProjectLink(projectLink: ProjectLink): ProjectLink {
  return {
    ...projectLink,
    adoPipelineId: projectLink.adoPipelineId ?? "",
    adoPipelineName: projectLink.adoPipelineName ?? "",
  };
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

/** Create a new Project Link and persist it. */
export function createProjectLink(dataDir: string, data: ProjectLinkInput): ProjectLink {
  const store = loadProjectLinkStore(dataDir);
  const id = crypto.randomBytes(8).toString("hex");
  const ts = nowSec();
  const projectLink: ProjectLink = { ...data, id, createdAt: ts, updatedAt: ts };
  store[id] = projectLink;
  saveProjectLinkStore(dataDir, store);
  return projectLink;
}

/** Update an existing Project Link. Returns null if not found. */
export function updateProjectLink(
  dataDir: string,
  id: string,
  data: Partial<ProjectLinkInput>,
): ProjectLink | null {
  const store = loadProjectLinkStore(dataDir);
  const existing = store[id];
  if (!existing) return null;
  const updated: ProjectLink = { ...existing, ...data, id, updatedAt: nowSec() };
  store[id] = updated;
  saveProjectLinkStore(dataDir, store);
  return updated;
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
  };
}
