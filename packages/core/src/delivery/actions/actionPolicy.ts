/**
 * Delivery action policy.
 *
 * Distinct from the tool-level ActionPolicy (tools/actionPolicy.ts) which
 * gates tool calls; this policy gates the higher-level ProposedAction: target
 * revision freshness, idempotency, expiry, risk and the global writes kill
 * switch. A generic MCP tool can never bypass this policy because the
 * executor only runs actions that carry an approved ActionRecord.
 */
import type { ArtifactRef } from "../artifactRef.js";
import { artifactStableKey, sameArtifactRevision } from "../artifactRef.js";
import type { ActionRecord, ActionRisk } from "./actionTypes.js";

export type DeliveryActionDecision = "allow_execute" | "approve" | "deny";

export interface DeliveryActionVerdict {
  decision: DeliveryActionDecision;
  reasons: string[];
}

export interface DeliveryActionPolicyContext {
  /** Global read-only kill switch for all remote writes. */
  writesEnabled: boolean;
  /** Current authoritative snapshot per stable artifact key. */
  currentRevisions: Map<string, ArtifactRef>;
  /** True when the idempotency key was already used for this project link. */
  idempotencyUsed: boolean;
    /**
   * Risk levels allowed to execute without approval. Defaults to none: every
   * mutating action is previewed, approved, executed, re-read and verified.
   */
  autoApproveRisk?: ActionRisk[];
}

const DEFAULT_AUTO_APPROVE: ActionRisk[] = [];

export class DeliveryActionPolicy {
  constructor(private readonly options: { now?: () => number } = {}) {}

  evaluate(record: ActionRecord, context: DeliveryActionPolicyContext): DeliveryActionVerdict {
    const reasons: string[] = [];
    if (!context.writesEnabled) {
      return {
        decision: "deny",
        reasons: ["global read-only kill switch is on; remote writes are disabled"],
      };
    }
    const now = this.options.now?.() ?? Date.now();
    if (record.expiresAt <= now) {
      return {
        decision: "deny",
        reasons: [`action expired at ${record.expiresAt}`],
      };
    }
    if (record.expectedResult.length === 0) {
      return {
        decision: "deny",
        reasons: ["action carries no verification predicates; a write without an expected re-read result is refused"],
      };
    }
    if (record.status === "verified" || record.status === "executing" || record.status === "verifying") {
      return {
        decision: "deny",
        reasons: [`action already in status ${record.status}; duplicate execution is refused`],
      };
    }
    if (context.idempotencyUsed) {
      return {
        decision: "deny",
        reasons: [`idempotency key ${record.idempotencyKey} was already used for this project link`],
      };
    }
    for (const basedOn of record.basedOn) {
      const current = context.currentRevisions.get(artifactStableKey(basedOn));
      if (current && !sameArtifactRevision(current, basedOn)) {
        reasons.push(
          `${basedOn.kind} target revision moved (proposed ${revisionOf(basedOn)}, current ${revisionOf(current)})`,
        );
      }
    }
    if (reasons.length > 0) {
      return { decision: "deny", reasons };
    }
    const autoApprove = context.autoApproveRisk ?? DEFAULT_AUTO_APPROVE;
    if (autoApprove.includes(record.risk)) {
      return { decision: "allow_execute", reasons: [`low-risk ${record.risk} action`] };
    }
    return { decision: "approve", reasons: [`risk level ${record.risk} requires explicit approval`] };
  }
}

function revisionOf(ref: ArtifactRef): string | number {
  switch (ref.kind) {
    case "work_item":
      return ref.revision;
    case "branch":
      return ref.objectId;
    case "commit":
      return ref.commitId;
    case "pull_request":
      return ref.sourceCommit;
    case "build":
      return ref.buildId;
    case "test_result":
      return ref.resultId;
    case "environment":
      return ref.environmentId;
    case "deployment":
      return ref.deploymentId;
  }
}
