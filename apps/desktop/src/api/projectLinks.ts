import { RUNTIME_URL, messageFromErrorBody, messageFromErrorResponse } from "./runtime.js";
import type {
  AdoDiscoveryAuthStatus,
  AdoDiscoveryKind,
  AdoDiscoveryResult,
  ProjectLink,
  ProjectLinkInput,
} from "./projectLinkTypes.js";

const PROJECT_LINKS_PATH = "/project-links";

/**
 * Typed failure for Azure DevOps discovery. The daemon answers auth failures
 * with `authStatus`/`authMode`/`retryable`; callers keep that structure
 * instead of guessing from a message string.
 */
export class AdoDiscoveryError extends Error {
  readonly kind: "auth" | "http";
  readonly status: number;
  readonly authStatus: AdoDiscoveryAuthStatus | undefined;
  readonly authMode: "oauth" | "pat" | undefined;
  readonly retryable: boolean;

  constructor(
    message: string,
    opts: {
      kind: "auth" | "http";
      status: number;
      authStatus?: AdoDiscoveryAuthStatus;
      authMode?: "oauth" | "pat";
      retryable?: boolean;
    },
  ) {
    super(message);
    this.name = "AdoDiscoveryError";
    this.kind = opts.kind;
    this.status = opts.status;
    this.authStatus = opts.authStatus;
    this.authMode = opts.authMode;
    this.retryable = opts.retryable ?? opts.kind === "http";
  }
}

interface AdoDiscoveryErrorBody {
  authStatus?: AdoDiscoveryAuthStatus;
  authMode?: "oauth" | "pat";
  authMessage?: string;
  retryable?: boolean;
  message?: string;
  error?: string;
}

export function adoDiscoveryErrorFromBody(status: number, text: string): AdoDiscoveryError {
  const fallback = messageFromErrorBody(`discover ADO HTTP ${status}`, text);
  let parsed: AdoDiscoveryErrorBody = {};
  try {
    const json = JSON.parse(text.trim()) as AdoDiscoveryErrorBody;
    if (json && typeof json === "object") parsed = json;
  } catch {
    // Plain text failure; fall back to the friendly message below.
  }
  const authStatus = parsed.authStatus;
  const authMode = parsed.authMode;
  const hasAuthSignal =
    authStatus !== undefined ||
    authMode !== undefined ||
    parsed.retryable !== undefined ||
    status === 401;
  const message = parsed.authMessage ?? parsed.message ?? parsed.error ?? fallback;
  return new AdoDiscoveryError(message, {
    kind: hasAuthSignal ? "auth" : "http",
    status,
    authStatus,
    authMode,
    retryable: parsed.retryable,
  });
}

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
    throw adoDiscoveryErrorFromBody(r.status, text);
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
