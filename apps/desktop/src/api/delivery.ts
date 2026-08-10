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
