import { RUNTIME_URL, messageFromErrorBody } from "./runtime.js";
import type {
  AdoDiscoveryKind,
  AdoDiscoveryResult,
  ProjectLink,
  ProjectLinkInput,
} from "./projectLinkTypes.js";

const PROJECT_LINKS_PATH = "/project-links";

export async function listProjectLinks(): Promise<ProjectLink[]> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}`);
  if (!r.ok) throw new Error(`${PROJECT_LINKS_PATH} HTTP ${r.status}`);
  return (await r.json()) as ProjectLink[];
}

export async function getProjectLink(id: string): Promise<ProjectLink> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${id}`);
  if (!r.ok) throw new Error(`${PROJECT_LINKS_PATH}/${id} HTTP ${r.status}`);
  return (await r.json()) as ProjectLink;
}

export async function createProjectLink(data: ProjectLinkInput): Promise<ProjectLink> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`createProjectLink HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ProjectLink;
}

export async function updateProjectLink(
  id: string,
  data: Partial<ProjectLinkInput>,
): Promise<ProjectLink> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`updateProjectLink HTTP ${r.status}: ${await r.text()}`);
  return (await r.json()) as ProjectLink;
}

export async function deleteProjectLink(id: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(`deleteProjectLink HTTP ${r.status}`);
}

export async function discoverAdoProjectLinkOptions(
  kind: AdoDiscoveryKind,
  projectLink: Partial<ProjectLinkInput>,
): Promise<AdoDiscoveryResult> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/discover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, projectLink }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(messageFromErrorBody(`discover ${kind} HTTP ${r.status}`, text));
  }
  return (await r.json()) as AdoDiscoveryResult;
}

export async function migrateProjectLinksToCloud(): Promise<{
  migrated: number;
  skipped: number;
  total: number;
}> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/migrate`, { method: "POST" });
  if (!r.ok) {
    const body = (await r.json()) as { message?: string };
    throw new Error(body.message ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<{ migrated: number; skipped: number; total: number }>;
}
