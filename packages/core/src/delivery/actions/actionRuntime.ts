/**
 * Delivery action runtime.
 *
 * Orchestrates Proposal → Approval → Execution → Re-read → Verification and
 * owns the persisted lifecycle of an ActionRecord. The runtime is the only
 * path that executes a remote write; the model can only create proposals.
 *
 * Recovery rule: after a restart, records in approved/executing/verifying are
 * NEVER re-executed. They are verified against the authoritative artifact
 * first; only a verified remote state completes them. An interrupted
 * execution that never produced a remote effect is marked failed with the
 * "re-propose" recovery guidance instead of being blind-retried.
 */
import type { ArtifactRef } from "../artifactRef.js";
import { artifactStableKey } from "../artifactRef.js";
import type {
  ActionAuditEntry,
  ActionRecord,
  ActionRisk,
  ActionStatus,
  ProposedAction,
} from "./actionTypes.js";
import { isTerminalActionStatus } from "./actionTypes.js";
import { DeliveryActionPolicy, type DeliveryActionVerdict } from "./actionPolicy.js";
import { DeliveryActionExecutor, type ExecutionResult } from "./actionExecutor.js";
import { ActionVerifier, type VerificationOutcome } from "./actionVerifier.js";
import type { DeliveryActionStore } from "./actionStore.js";
import type { ActionTransport } from "./actionTransport.js";

export interface ProposeInput {
  turnId: string;
  projectLinkId: string;
  kind: string;
  target: ArtifactRef;
  basedOn: ArtifactRef[];
  payload: unknown;
  risk: ActionRisk;
  reason: string;
  expectedResult: ProposedAction["expectedResult"];
  idempotencyKey: string;
  expiresAt: number;
  /** When true, the proposal is persisted awaiting approval even for low risk. */
  forceApproval?: boolean;
}

export interface ProposeResult {
  record: ActionRecord;
  verdict: DeliveryActionVerdict;
}

export interface ApproveResult {
  record: ActionRecord;
  execution?: ExecutionResult;
  verification?: VerificationOutcome;
  error?: { kind: "not_found" | "policy" | "execution" | "verification"; message: string };
}

export interface RecoverySummary {
  recordsConsidered: number;
  verified: string[];
  failed: string[];
}

export class DeliveryActionRuntime {
  constructor(
    private readonly store: DeliveryActionStore,
    private readonly policy: DeliveryActionPolicy,
    private readonly executor: DeliveryActionExecutor,
    private readonly verifier: ActionVerifier,
    private readonly transport: ActionTransport,
    private readonly options: {
      writesEnabled?: () => boolean;
      now?: () => number;
      /** Verification retry policy (test injection; defaults are production-safe). */
      verifierOptions?: { attempts?: number; intervalMs?: number; timeoutMs?: number };
    } = {},
  ) {}

  /** Persist a proposed action. Never performs a remote write. */
  async propose(input: ProposeInput): Promise<ProposeResult> {
    const now = this.options.now?.() ?? Date.now();
    const record: ActionRecord = {
      id: actionId(input.projectLinkId, input.idempotencyKey),
      status: "proposed",
      createdAt: now,
      audit: [],
      ...input,
    };
    // The id is deterministic per project link + idempotency key: a repeated
    // proposal of the same logical write resolves to the same record, and the
    // existing record stays authoritative — the duplicate guard, never a
    // second remote mutation.
    const existing = await this.store.get(record.id);
    if (existing) {
      return {
        record: existing,
        verdict: { decision: "deny", reasons: [`idempotency key ${input.idempotencyKey} already proposed`] },
      };
    }
    const verdict = this.policy.evaluate(record, await this.policyContext(record));
    if (verdict.decision === "deny") {
      const failed: ActionRecord = {
        ...record,
        status: "failed",
        failure: { kind: "policy", message: verdict.reasons.join("; ") },
        audit: this.audit(record, "failed", verdict.reasons.join("; ")),
      };
      await this.store.propose(failed);
      return { record: failed, verdict };
    }
    if (verdict.decision === "allow_execute" && !input.forceApproval) {
      const pending: ActionRecord = {
        ...record,
        status: "approved",
        approvedAt: now,
        audit: this.audit(record, "approved", "low-risk action; approval recorded for audit"),
      };
      await this.store.propose(pending);
      return { record: pending, verdict };
    }
    const awaiting: ActionRecord = {
      ...record,
      status: "awaiting_approval",
      audit: this.audit(record, "awaiting_approval", `risk ${input.risk}`),
    };
    await this.store.propose(awaiting);
    return { record: awaiting, verdict };
  }

  /** Approve the STORED action, execute it, re-read and verify. */
  async approve(id: string): Promise<ApproveResult> {
    const record = await this.store.get(id);
    if (!record) return { record: undefined as unknown as ActionRecord, error: { kind: "not_found", message: `no action ${id}` } };
    if (record.status !== "awaiting_approval") {
      return {
        record,
        error: { kind: "policy", message: `action is ${record.status}; approval applies to awaiting_approval only` },
      };
    }
    const now = this.options.now?.() ?? Date.now();
    if (record.expiresAt <= now) {
      const stale: ActionRecord = {
        ...record,
        status: "failed",
        failure: { kind: "expired", message: "action expired before approval" },
        audit: this.audit(record, "failed", "expired before approval"),
      };
      await this.store.updateStatus(stale);
      return { record: stale, error: { kind: "policy", message: "action expired before approval" } };
    }
    const verdict = this.policy.evaluate(record, await this.policyContext(record));
    if (verdict.decision === "deny") {
      const denied: ActionRecord = {
        ...record,
        status: "stale",
        failure: { kind: "policy", message: verdict.reasons.join("; ") },
        audit: this.audit(record, "stale", verdict.reasons.join("; ")),
      };
      await this.store.updateStatus(denied);
      return { record: denied, error: { kind: "policy", message: verdict.reasons.join("; ") } };
    }

    const executing: ActionRecord = {
      ...record,
      status: "executing",
      approvedAt: now,
      audit: this.audit(record, "approved", "user approved the stored action"),
    };
    await this.store.updateStatus(executing);

    // The executor sees the pre-execution status: it refuses records that
    // already ran, and "approved" is the boundary between the two.
    const execution = await this.executor.execute({ ...executing, status: "approved" }, now);
    if (!execution.ok || !execution.outcome.ok) {
      const failed: ActionRecord = {
        ...executing,
        status: "failed",
        failure: execution.failure ?? { kind: "transport", message: execution.outcome.summary },
        audit: this.audit(executing, "failed", execution.outcome.summary),
      };
      await this.store.updateStatus(failed);
      return { record: failed, execution, error: { kind: "execution", message: execution.outcome.summary } };
    }

    const verifying: ActionRecord = {
      ...executing,
      status: "verifying",
      executedAt: now,
      audit: this.audit(executing, "executed", execution.outcome.summary),
    };
    await this.store.updateStatus(verifying);

    const verification = await this.verifier.verify(verifying, {
      now: this.options.now,
      ...this.options.verifierOptions,
    });
    if (verification.status === "verified") {
      const verified: ActionRecord = {
        ...verifying,
        status: "verified",
        verifiedAt: now,
        audit: this.audit(verifying, "verified", verification.evidence.join("; ")),
      };
      await this.store.updateStatus(verified);
      return { record: verified, execution, verification };
    }
    const failed: ActionRecord = {
      ...verifying,
      status: "failed",
      failure: {
        kind: "verification",
        message: `${verification.status}: ${verification.evidence.join("; ")}`,
      },
      audit: this.audit(verifying, "failed", verification.evidence.join("; ")),
    };
    await this.store.updateStatus(failed);
    return {
      record: failed,
      execution,
      verification,
      error: { kind: "verification", message: failed.failure?.message ?? "verification failed" },
    };
  }

  async reject(id: string, feedback?: string): Promise<ActionRecord | undefined> {
    const record = await this.store.get(id);
    if (!record || isTerminalActionStatus(record.status)) return record;
    const rejected: ActionRecord = {
      ...record,
      status: "rejected",
      audit: this.audit(record, "rejected", feedback ?? "user rejected the proposal"),
    };
    await this.store.updateStatus(rejected);
    return rejected;
  }

  /** Re-verify in-flight actions after restart. Never re-executes a write. */
  async resumeVerification(): Promise<RecoverySummary> {
    const inFlight = await this.store.listInFlight();
    const summary: RecoverySummary = { recordsConsidered: inFlight.length, verified: [], failed: [] };
    for (const record of inFlight) {
      const verified = await this.verifier.verify(record, {
        now: this.options.now,
        ...this.options.verifierOptions,
      });
      if (verified.status === "verified") {
        const completed: ActionRecord = {
          ...record,
          status: "verified",
          verifiedAt: this.options.now?.() ?? Date.now(),
          audit: this.audit(record, "recovered", `verification resumed after restart: ${verified.evidence.join("; ")}`),
        };
        await this.store.updateStatus(completed);
        summary.verified.push(record.id);
      } else {
        const failed: ActionRecord = {
          ...record,
          status: "failed",
          failure: {
            kind: record.executedAt ? "verification" : "interrupted",
            message: record.executedAt
              ? `restart recovery: ${verified.status} — ${verified.evidence.join("; ")}`
              : "execution interrupted before a remote write was confirmed; re-propose instead of retrying",
          },
          audit: this.audit(record, "failed", "restart recovery could not verify remote state"),
        };
        await this.store.updateStatus(failed);
        summary.failed.push(record.id);
      }
    }
    return summary;
  }

  /** Called when an authoritative artifact revision moves. */
  async markStaleForTarget(projectLinkId: string, ref: ArtifactRef): Promise<number> {
    return this.store.markStaleForTarget(projectLinkId, ref);
  }

  /**
   * Current revisions are read from the authoritative source (transport),
   * never from the store: the staleness check must compare the proposed
   * basedOn revision against remote reality at decision time.
   */
  private async policyContext(record: ActionRecord): Promise<{
    writesEnabled: boolean;
    currentRevisions: Map<string, ArtifactRef>;
    idempotencyUsed: boolean;
  }> {
    const writesEnabled = this.options.writesEnabled?.() ?? true;
    // Duplicate proposals are refused by the deterministic record id before
    // the policy runs; at approval time this record itself is the only holder
    // of the key, so the idempotency flag is always false here.
    const currentRevisions = new Map<string, ArtifactRef>();
    for (const ref of [...record.basedOn, record.target]) {
      const observation = await this.transport.readArtifact(ref);
      if (observation?.ref && artifactStableKey(observation.ref) === artifactStableKey(ref)) {
        currentRevisions.set(artifactStableKey(observation.ref), observation.ref);
      }
    }
    return { writesEnabled, currentRevisions, idempotencyUsed: false };
  }

  private audit(record: ActionRecord, event: ActionAuditEntry["event"], detail?: string): ActionAuditEntry[] {
    return [...record.audit, { at: this.options.now?.() ?? Date.now(), event, detail }];
  }
}

export function actionId(projectLinkId: string, idempotencyKey: string): string {
  // Deterministic id so re-proposing the same logical write resolves to the
  // same record — the duplicate guard, not a random collision, prevents a
  // second remote mutation.
  return `act-${hash(`${projectLinkId}|${idempotencyKey}`)}`;
}

function hash(text: string): string {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return (value >>> 0).toString(36);
}
