import { RUNTIME_URL, messageFromErrorResponse } from "./runtime.js";

/** Global read-only kill switch for all remote delivery writes. */
export interface DeliveryWritesState {
  enabled: boolean;
}

export async function fetchDeliveryWritesState(): Promise<DeliveryWritesState> {
  const r = await fetch(`${RUNTIME_URL}/delivery/writes-enabled`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Delivery state HTTP ${r.status}`, r));
  return r.json() as Promise<DeliveryWritesState>;
}

export async function setDeliveryWritesEnabled(enabled: boolean): Promise<DeliveryWritesState> {
  const r = await fetch(`${RUNTIME_URL}/delivery/writes-enabled`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Delivery state HTTP ${r.status}`, r));
  return r.json() as Promise<DeliveryWritesState>;
}

export interface DeliveryActionRecord {
  id: string;
  status: string;
  kind: string;
  target: Record<string, unknown>;
  payload: Record<string, unknown>;
  failure?: { kind: string; message: string };
  verificationEvidence?: string[];
}

export async function proposeDeliveryAction(proposal: Record<string, unknown>): Promise<DeliveryActionRecord> {
  const r = await fetch(`${RUNTIME_URL}/delivery/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proposal),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Propose action HTTP ${r.status}`);
  }
  return r.json() as Promise<DeliveryActionRecord>;
}

export async function approveDeliveryAction(id: string): Promise<DeliveryActionRecord> {
  const r = await fetch(`${RUNTIME_URL}/delivery/actions/${encodeURIComponent(id)}/approve`, {
    method: "POST",
  });
  const body = (await r.json().catch(() => null)) as DeliveryActionRecord | { error?: string } | null;
  if (!r.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Approve action HTTP ${r.status}`);
  }
  return body as DeliveryActionRecord;
}

/** Reject a prepared delivery write. This is terminal and never executes the action. */
export async function rejectDeliveryAction(id: string, feedback?: string): Promise<DeliveryActionRecord> {
  const r = await fetch(`${RUNTIME_URL}/delivery/actions/${encodeURIComponent(id)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feedback?.trim() ? { feedback: feedback.trim() } : {}),
  });
  const body = (await r.json().catch(() => null)) as DeliveryActionRecord | { error?: string } | null;
  if (!r.ok) {
    throw new Error((body as { error?: string } | null)?.error ?? `Reject action HTTP ${r.status}`);
  }
  return body as DeliveryActionRecord;
}

export interface PullRequestPreparation {
  projectLinkId: string;
  repositoryId: string;
  generatedAt: number;
  git: {
    repoPath: string;
    sourceBranch: string;
    targetBranch: string;
    headSha: string;
    targetSha?: string;
    remoteSourceSha?: string;
    remoteTargetSha?: string;
    upstream?: string;
    ahead?: number;
    behind?: number;
    dirty: boolean;
    changedFiles: string[];
    diffStat: string;
    commits: Array<{ sha: string; subject: string }>;
    targetAvailability: "available" | "missing" | "unavailable" | "failed";
  };
  validation: {
    status: "passed" | "failed" | "not_run" | "unavailable";
    command?: string;
    summary: string;
    sourceSha?: string;
    durationMs?: number;
    outputExcerpt?: string;
  };
  workItem: {
    status: "available" | "missing" | "unavailable" | "failed";
    item?: WorkItemDetail;
    message?: string;
  };
  policies: {
    status: "available" | "missing" | "unavailable" | "failed";
    targetRef: string;
    configurations: Array<{
      id: number;
      revision: number;
      typeId: string;
      displayName: string;
      isEnabled: boolean;
      isBlocking: boolean;
    }>;
    message?: string;
  };
  suggestion: {
    sourceBranch: string;
    targetBranch: string;
    title: string;
    description: string;
    draft: boolean;
    workItemId?: number;
    reviewerFocus: string[];
    risks: string[];
    missingEvidence: string[];
    readiness: "ready" | "needs_attention" | "blocked" | "insufficient_evidence";
  };
}

export type PullRequestValidationResult = PullRequestPreparation["validation"] & {
  projectLinkId: string;
  repoPath: string;
  completedAt: number;
};

export async function runPullRequestValidation(input: {
  projectLinkId: string;
  expectedHeadSha: string;
}): Promise<PullRequestValidationResult> {
  const r = await fetch(`${RUNTIME_URL}/delivery/pull-request-validation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `Pull request validation HTTP ${r.status}`);
  }
  return r.json() as Promise<PullRequestValidationResult>;
}

export async function fetchPullRequestPreparation(input: {
  projectLinkId: string;
  sourceBranch?: string;
  targetBranch?: string;
  title?: string;
  description?: string;
  draft?: boolean;
  workItemId?: number;
}): Promise<PullRequestPreparation> {
  const r = await fetch(`${RUNTIME_URL}/delivery/pull-request-preparation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new Error(body?.message ?? body?.error ?? `Pull request preparation HTTP ${r.status}`);
  }
  return r.json() as Promise<PullRequestPreparation>;
}

export interface WorkItemRelationLink {
  rel: string;
  url: string;
  kind: string;
  id?: number;
  label?: string;
}

export interface WorkItemLinkedPullRequest {
  id: number;
  title: string;
  status: string;
  sourceBranch?: string;
  targetBranch?: string;
  url?: string;
}

export interface WorkItemLinkedBuild {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  definitionName: string;
  url?: string;
}

export interface WorkItemTestEvidence {
  buildId: number;
  runCount: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
}

/**
 * Full inspector read of one Azure Boards work item: typed relation edges,
 * resolved pull request / build artifacts, test evidence for linked builds,
 * and the complete comment thread. The feed keeps only the last few updates;
 * this endpoint is the authoritative read for a single item.
 */
export interface WorkItemDetail {
  id: number;
  revision: number;
  type: string;
  title: string;
  state: string;
  description?: string;
  acceptanceCriteria?: string;
  iterationPath?: string;
  tags: string[];
  assignedTo?: string;
  createdDate?: string;
  changedDate?: string;
  relations: WorkItemRelationLink[];
  linkedPullRequests: WorkItemLinkedPullRequest[];
  linkedBuilds: WorkItemLinkedBuild[];
  testEvidence: WorkItemTestEvidence[];
  comments: string[];
}

export async function fetchWorkItemDetail(
  projectLinkId: string,
  workItemId: number,
): Promise<WorkItemDetail> {
  const query = new URLSearchParams({ projectLinkId });
  const r = await fetch(`${RUNTIME_URL}/delivery/work-items/${workItemId}?${query.toString()}`);
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Work item detail HTTP ${r.status}`);
  }
  const data = (await r.json()) as { workItem: WorkItemDetail };
  return data.workItem;
}

export interface DeliveryEvidenceBundle {
  build: {
    id: number;
    buildNumber: string;
    status: string;
    result: string;
    branch: string;
    sourceVersion: string;
    definitionName: string;
  };
  timelineIssues: Array<{ taskName: string; result: string }>;
  errorIssues: Array<{ type: string; message: string }>;
  logExcerpts: Array<{ taskName: string; excerpt: string; contentHash: string }>;
  signature: { definitionId: number; taskName: string; errorClass: string; normalizedText: string };
  classification: { class: string; confidence: number; decisiveEvidence: string[]; missingEvidence: string[] };
  coverage: "complete" | "partial" | "missing";
}

export async function fetchDeliveryEvidence(
  buildId: number,
  projectLinkId: string,
  definitionId: number,
): Promise<DeliveryEvidenceBundle> {
  const query = new URLSearchParams({ projectLinkId, definitionId: String(definitionId) });
  const r = await fetch(`${RUNTIME_URL}/delivery/evidence/${buildId}?${query.toString()}`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Evidence HTTP ${r.status}`, r));
  return r.json() as Promise<DeliveryEvidenceBundle>;
}

export interface DeliveryDiagnostics {
  correlationId: string;
  generatedAt: number;
  telemetry: {
    totals: Record<string, number>;
    byKind: Record<string, Record<string, number>>;
    lastVerifiedAt?: number;
  };
  killSwitch: { writesEnabled: boolean };
}

export async function fetchDeliveryDiagnostics(): Promise<DeliveryDiagnostics> {
  const r = await fetch(`${RUNTIME_URL}/delivery/diagnostics`);
  if (!r.ok) throw new Error(await messageFromErrorResponse(`Diagnostics HTTP ${r.status}`, r));
  return r.json() as Promise<DeliveryDiagnostics>;
}
