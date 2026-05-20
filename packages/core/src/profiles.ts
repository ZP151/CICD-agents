import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── YAML template profile schema (unchanged) ─────────────────────────────────

const BuildSpec = z.object({ command: z.string().default("") }).default({ command: "" });
const TestSpec = z.object({ command: z.string().default("") }).default({ command: "" });

const AzureDevOpsSpec = z
  .object({
    organization: z.string().default(""),
    project: z.string().default(""),
    repository: z.string().default(""),
    default_target_branch: z.string().default("main"),
    pipeline_id: z.number().int().nullable().default(null),
  })
  .default({});

const ProfileSchema = z.object({
  description: z.string().default(""),
  languages: z.array(z.string()).default([]),
  build: BuildSpec,
  test: TestSpec,
  azure_devops: AzureDevOpsSpec,
  ignored_globs: z.array(z.string()).default([]),
});

const ProfilesFile = z.object({
  profiles: z.record(ProfileSchema).default({}),
});

/** Profile as loaded from the YAML template file. */
export type Profile = z.infer<typeof ProfileSchema> & { name: string };

export const DEFAULT_PROFILES_PATH = path.resolve(__dirname, "../config/profiles.yaml");

function resolvePath(override?: string): string {
  if (override && fs.existsSync(override)) return override;
  const envOverride = process.env.CICD_AGENT_PROFILES_PATH;
  if (envOverride && fs.existsSync(envOverride)) return envOverride;
  return DEFAULT_PROFILES_PATH;
}

const emptyProfile = (name: string): Profile => ({
  name,
  description: "",
  languages: [],
  build: { command: "" },
  test: { command: "" },
  azure_devops: {
    organization: "",
    project: "",
    repository: "",
    default_target_branch: "main",
    pipeline_id: null,
  },
  ignored_globs: [],
});

/** Load all profiles from the YAML template file. Unchanged behaviour. */
export function loadProfiles(profilesPath?: string): Record<string, Profile> {
  const target = resolvePath(profilesPath);
  if (!fs.existsSync(target)) {
    return { default: emptyProfile("default") };
  }
  const text = fs.readFileSync(target, "utf8");
  const raw = YAML.parse(text) ?? {};
  const parsed = ProfilesFile.parse(raw);
  const out: Record<string, Profile> = {};
  for (const [name, p] of Object.entries(parsed.profiles)) {
    out[name] = { name, ...p };
  }
  if (!out.default) out.default = emptyProfile("default");
  return out;
}

/** Get a single YAML template profile by name. */
export function getProfile(name: string, profilesPath?: string): Profile {
  const all = loadProfiles(profilesPath);
  return all[name] ?? all.default ?? emptyProfile(name);
}

// ─── Workspace profiles ────────────────────────────────────────────────────────
//
// "Workspace profiles" are user-created, mutable, and stored in a JSON file
// inside dataDir (never committed to source control).  They extend the YAML
// schema with workspace-specific fields:  local repo path, default/target
// branch, and the ADO PAT (kept out of the YAML for security reasons).
//
// The ADO org / project / repository / pipeline_id fields are deliberately
// duplicated here rather than re-using the nested `azure_devops` spec so that
// the UI can work with a flat, simple object.
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkspaceProfile {
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

  // Azure DevOps connection (stored per-profile; PAT never written to YAML)
  adoOrgUrl: string;     // e.g. https://dev.azure.com/myorg
  adoProject: string;
  adoRepoName: string;
  adoPat: string;

  // Pipeline (optional)
  adoPipelineId: string;
  adoPipelineName: string;

  // Optional reference to a YAML build/test template
  templateProfile: string;   // name of a Profile from profiles.yaml, or ""

  // Build / test commands — can override the template
  buildCommand: string;
  testCommand: string;
}

export type WorkspaceProfileInput = Omit<WorkspaceProfile, "id" | "createdAt" | "updatedAt">;

type WorkspaceStore = Record<string, WorkspaceProfile>;

function workspaceStorePath(dataDir: string): string {
  return path.join(dataDir, "workspace-profiles.json");
}

function loadWorkspaceStore(dataDir: string): WorkspaceStore {
  const p = workspaceStorePath(dataDir);
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as WorkspaceStore;
  } catch {
    return {};
  }
}

function saveWorkspaceStore(dataDir: string, store: WorkspaceStore): void {
  const p = workspaceStorePath(dataDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2), "utf8");
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** List all workspace profiles, newest-updated first. */
export function listWorkspaceProfiles(dataDir: string): WorkspaceProfile[] {
  return Object.values(loadWorkspaceStore(dataDir)).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Get a single workspace profile by id, or null if not found. */
export function getWorkspaceProfile(dataDir: string, id: string): WorkspaceProfile | null {
  return loadWorkspaceStore(dataDir)[id] ?? null;
}

/** Create a new workspace profile and persist it. */
export function createWorkspaceProfile(dataDir: string, data: WorkspaceProfileInput): WorkspaceProfile {
  const store = loadWorkspaceStore(dataDir);
  const id = crypto.randomBytes(8).toString("hex");
  const ts = nowSec();
  const profile: WorkspaceProfile = { ...data, id, createdAt: ts, updatedAt: ts };
  store[id] = profile;
  saveWorkspaceStore(dataDir, store);
  return profile;
}

/** Update an existing workspace profile. Returns null if not found. */
export function updateWorkspaceProfile(
  dataDir: string,
  id: string,
  data: Partial<WorkspaceProfileInput>,
): WorkspaceProfile | null {
  const store = loadWorkspaceStore(dataDir);
  const existing = store[id];
  if (!existing) return null;
  const updated: WorkspaceProfile = { ...existing, ...data, id, updatedAt: nowSec() };
  store[id] = updated;
  saveWorkspaceStore(dataDir, store);
  return updated;
}

/** Delete a workspace profile. Returns false if not found. */
export function deleteWorkspaceProfile(dataDir: string, id: string): boolean {
  const store = loadWorkspaceStore(dataDir);
  if (!store[id]) return false;
  delete store[id];
  saveWorkspaceStore(dataDir, store);
  return true;
}

/**
 * Build the ToolContext extra fields from a workspace profile so that ADO
 * tools receive the correct org / project / repo / PAT automatically.
 */
export function profileToToolExtra(profile: WorkspaceProfile): Record<string, unknown> {
  const orgSlug = profile.adoOrgUrl.replace(/\/$/, "").split("/").pop() ?? profile.adoOrgUrl;
  return {
    ado_org: orgSlug,
    ado_project: profile.adoProject,
    ado_repository: profile.adoRepoName,
    ado_target_branch: profile.targetBranch,
    ado_pat: profile.adoPat,
    ...(profile.adoPipelineId ? { ado_pipeline_id: profile.adoPipelineId } : {}),
  };
}
