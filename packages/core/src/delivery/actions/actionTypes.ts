/**
 * Proposed action contract (delivery graph).
 *
 * The model never writes to ADO directly; it can only propose a typed action.
 * A ProposedAction is persisted BEFORE approval, carries the exact target,
 * source revisions, payload, risk, expected result, idempotency key and
 * expiry. Approval executes the stored action, never a regenerated model
 * action. See docs/product/delivery-graph-and-action-runtime.md.
 */
import type { ArtifactRef } from "../artifactRef.js";

export type ActionRisk = "low" | "medium" | "high" | "critical";

export type ActionStatus =
  | "proposed"
  | "awaiting_approval"
  | "approved"
  | "executing"
  | "verifying"
  | "verified"
  | "rejected"
  | "stale"
  | "failed"
  | "cancelled";

export type VerificationCondition =
  | "exists"
  | "field_eq"
  | "relation_present"
  | "revision_gt"
  | "run_visible";

/**
 * A predicate over the authoritative artifact after the write. HTTP success
 * is never verification: a work-item update is verified when the re-read
 * revision contains the expected field or link; a pipeline trigger when a new
 * run with the expected definition/branch/correlation is visible.
 */
export interface VerificationPredicate {
  artifact: ArtifactRef;
  condition: VerificationCondition;
  /** Field name for field_eq; relation target for relation_present. */
  field?: string;
  expected?: unknown;
  /** Correlation marker (e.g. pipeline run name or commit) for run_visible. */
  correlation?: string;
  /** Revision present when the write lands (e.g. work item revision+1). */
  expectedRevision?: number;
}

export interface ProposedAction<TPayload = unknown> {
  id: string;
  turnId: string;
  projectLinkId: string;
  kind: string;
  target: ArtifactRef;
  basedOn: ArtifactRef[];
  payload: TPayload;
  risk: ActionRisk;
  reason: string;
  expectedResult: VerificationPredicate[];
  idempotencyKey: string;
  expiresAt: number;
}

export type ActionAuditEvent =
  | "proposed"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "executed"
  | "verify_started"
  | "verified"
  | "failed"
  | "stale"
  | "cancelled"
  | "recovered";

export interface ActionAuditEntry {
  at: number;
  event: ActionAuditEvent;
  detail?: string;
}

export interface ActionFailure {
  kind: "transport" | "verification" | "policy" | "expired" | "interrupted";
  message: string;
}

/** The persisted form of a ProposedAction with its lifecycle state. */
export interface ActionRecord<TPayload = unknown> extends ProposedAction<TPayload> {
  status: ActionStatus;
  createdAt: number;
  approvedAt?: number;
  executedAt?: number;
  verifiedAt?: number;
  failure?: ActionFailure;
  audit: ActionAuditEntry[];
}

export const TERMINAL_ACTION_STATUSES: ReadonlySet<ActionStatus> = new Set([
  "verified", "rejected", "stale", "failed", "cancelled",
]);

export function isTerminalActionStatus(status: ActionStatus): boolean {
  return TERMINAL_ACTION_STATUSES.has(status);
}

/** Statuses that must never re-execute the remote write. */
export function isExecutingActionStatus(status: ActionStatus): boolean {
  return status === "approved" || status === "executing" || status === "verifying";
}
