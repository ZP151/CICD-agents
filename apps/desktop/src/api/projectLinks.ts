import { RUNTIME_URL, messageFromErrorBody, messageFromErrorResponse } from "./runtime.js";
import type {
  AdoDiscoveryKind,
  AdoDiscoveryResult,
  ProjectLink,
  ProjectLinkInput,
} from "./projectLinkTypes.js";

const PROJECT_LINKS_PATH = "/project-links";

export async function listProjectLinks(): Promise<ProjectLink[]> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Project Links HTTP ${r.status}`, r));
  return (await r.json()) as ProjectLink[];
}

export async function getProjectLink(id: string): Promise<ProjectLink> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${id}`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Project Link HTTP ${r.status}`, r));
  return (await r.json()) as ProjectLink;
}

export async function createProjectLink(data: ProjectLinkInput): Promise<ProjectLink> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Create Project Link HTTP ${r.status}`, r));
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
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Update Project Link HTTP ${r.status}`, r));
  return (await r.json()) as ProjectLink;
}

export async function deleteProjectLink(id: string): Promise<void> {
  const r = await fetch(`${RUNTIME_URL}${PROJECT_LINKS_PATH}/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Delete Project Link HTTP ${r.status}`, r));
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
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Project Link migration HTTP ${r.status}`, r));
  return r.json() as Promise<{ migrated: number; skipped: number; total: number }>;
}
