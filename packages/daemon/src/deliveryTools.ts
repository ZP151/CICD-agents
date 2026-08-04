/**
 * Delivery action tools for the chat planner.
 *
 * delivery_propose_action is the single chat entry point of the verified
 * action runtime: the first call persists a ProposedAction and requests
 * approval; the approved re-call (the model is never invoked again) loads
 * the stored action and runs Proposal → Approval → Execution → Re-read →
 * Verification. The deterministic action id per project link + idempotency
 * key guarantees the same record is reused — a duplicate call can never
 * produce a second remote mutation.
 */
import {
  ActionVerifier,
  actionId,
  AdoActionTransport,
  DeliveryActionExecutor,
  DeliveryActionPolicy,
  DeliveryActionRuntime,
  isArtifactRef,
  SqliteDeliveryActionStore,
  ToolError,
  type ArtifactRef,
  type Tool,
} from "@mergepilot/core";
import { deliveryWritesState } from "./deliveryWritesState.js";

export function deliveryTools(): Tool[] {
  return [deliveryProposeActionTool()];
}

function deliveryProposeActionTool(): Tool {
  return {
    name: "delivery_propose_action",
    description:
      "Propose a persisted, verifiable Azure DevOps action. The exact action is stored locally and shown for " +
      "approval; after approval it is executed once and verified by re-reading Azure DevOps. Returns the action " +
      "id, status, and verification evidence. " +
      "Target templates (projectLinkId is filled in automatically; never use placeholders): " +
      "work_item.comment -> target {kind: work_item, id: 7912}; " +
      "pull_request.create -> target {kind: pull_request, id: 0} with payload repositoryId, sourceBranch, " +
      "targetBranch, title, workItemId; " +
      "pipeline.trigger -> target {kind: build, definitionId: 117, buildId: 0} with payload pipelineId and branch. " +
      "For work_item.comment use expected_result with condition revision_gt (expectedRevision = the work item's current revision) " +
      "and/or condition comment_contains (expected = the exact comment text). " +
      "For pipeline.trigger use expected_result run_visible with correlation = the source commit sha.",
    parameters: {
      type: "object",
      required: ["kind", "target", "payload", "risk", "reason", "idempotency_key", "expires_at"],
      properties: {
        kind: { type: "string", description: "Action kind, e.g. work_item.comment" },
        target: {
          type: "object",
          description: "Canonical target artifact ref: { kind, projectLinkId, id, revision } for work_item.",
        },
        based_on: {
          type: "array",
          items: { type: "object" },
          description: "Artifact revisions the proposal is based on (staleness guard).",
        },
        payload: {
          type: "object",
          description: "Exact write payload, e.g. { text } for work_item.comment.",
        },
        risk: { type: "string", enum: ["low", "medium", "high", "critical"] },
        reason: { type: "string" },
        expected_result: {
          type: "array",
          items: { type: "object" },
          description: "Verification predicates over the authoritative artifact after the write.",
        },
        idempotency_key: { type: "string", description: "Stable key so the same logical write cannot run twice." },
        expires_at: { type: "integer", description: "Epoch ms after which the proposal expires." },
      },
    },
    handler: async (ctx, payload) => {
      const projectLinkId = String(ctx.extra["project_link_id"] ?? "");
      const organization = String(ctx.extra["ado_org"] ?? "");
      const project = String(ctx.extra["ado_project"] ?? "");
      if (!projectLinkId) {
        throw new ToolError("delivery_propose_action requires an active Project Link.");
      }
      if (!organization || !project) {
        throw new ToolError("delivery_propose_action requires the Project Link's ADO org and project.");
      }
      const target = payload["target"] as unknown;
      if (!isScopedArtifactShape(target)) {
        throw new ToolError("delivery_propose_action requires a valid target ArtifactRef (kind and identity fields).");
      }
      // The Project Link identity comes from the tool context, never from the
      // model payload: the model cannot choose a different workspace.
      const scopedTarget: ArtifactRef = { ...(target as ArtifactRef), projectLinkId };
      const { runtime, transport } = createDeliveryRuntime(projectLinkId, organization, project);
      // The proposal must carry the current revision so the staleness guard
      // has a baseline. The model cannot invent it; read it from ADO.
      if (scopedTarget.kind === "work_item" && typeof scopedTarget.revision !== "number") {
        const observation = await transport.readArtifact(scopedTarget);
        const observed = observation?.ref;
        if (observed && observed.kind === "work_item" && typeof observed.revision === "number") {
          scopedTarget.revision = observed.revision;
        }
      }
      const basedOn = Array.isArray(payload["based_on"])
        ? (payload["based_on"] as unknown[])
            .filter(isScopedArtifactShape)
            .map((ref) => ({ ...(ref as ArtifactRef), projectLinkId }))
        : [];
      const expectedResult = Array.isArray(payload["expected_result"]) && payload["expected_result"].length > 0
        ? (payload["expected_result"] as unknown[])
            .filter(isVerificationPredicate)
            .map((predicate) => ({
              artifact: {
                ...(predicate as { artifact: unknown }).artifact as ArtifactRef,
                projectLinkId,
              },
              condition: (predicate as { condition: string }).condition as "exists",
              field: (predicate as { field?: string }).field,
              expected: (predicate as { expected?: unknown }).expected,
              correlation: (predicate as { correlation?: string }).correlation,
              expectedRevision: (predicate as { expectedRevision?: number }).expectedRevision,
            }))
        : defaultPredicatesFor(
            String(payload["kind"] ?? ""),
            scopedTarget,
            (payload["payload"] as Record<string, unknown>) ?? {},
          );

      const idempotencyKey = String(payload["idempotency_key"] ?? "");
      // A missing/zero expiry cannot produce an instantly-stale proposal;
      // default to one hour so the approval window stays human-sized.
      const expiresAt = Number(payload["expires_at"] ?? 0) > 0
        ? Number(payload["expires_at"])
        : Date.now() + 3_600_000;
      const store = new SqliteDeliveryActionStore();
      const recordId = actionId(projectLinkId, idempotencyKey);

      // The tool runs only after the user approved the exact action payload
      // in the approval card. Persist the stored action first, then execute
      // and verify it — never a regenerated model action. A repeated call
      // resolves the same deterministic record: terminal results are replayed
      // without re-executing; in-flight records resume verification.
      const existing = await store.get(recordId);
      if (existing && existing.status === "verified") {
        return {
          action_id: existing.id,
          status: existing.status,
          verification: existing.audit
            .filter((entry) => entry.event === "verified")
            .map((entry) => entry.detail ?? ""),
          summary: summarizeApprovedAction(existing),
        };
      }
      if (existing) {
        // A retry with the same idempotency key is allowed only when the
        // record never executed (no remote write happened). In-flight records
        // resume verification; everything else is refused.
        if (existing.status === "failed" && !existing.executedAt) {
          const retried = await runtime.retry(existing.id, {
            payload: (payload["payload"] as Record<string, unknown>) ?? existing.payload,
            expectedResult,
            expiresAt,
            reason: String(payload["reason"] ?? existing.reason),
          });
          if (retried.verdict.decision === "deny") {
            return {
              action_id: existing.id,
              status: retried.record.status,
              failure: retried.verdict.reasons.join("; "),
              verification: [],
              summary: summarizeApprovedAction(retried.record),
            };
          }
          const result = await runtime.approve(retried.record.id);
          return {
            action_id: existing.id,
            status: result.record.status,
            failure: result.error?.message,
            verification: result.verification?.evidence ?? [],
            summary: summarizeApprovedAction(result.record),
          };
        }
        const result = await runtime.approve(existing.id);
        return {
          action_id: existing.id,
          status: result.record.status,
          failure: result.error?.message,
          verification: result.verification?.evidence ?? [],
          summary: summarizeApprovedAction(result.record),
        };
      }

      const proposal = await runtime.propose({
        // The chat turn id is not part of the tool context; Cycle 01 binds
        // the action record to the Turn timeline explicitly.
        turnId: "chat",
        projectLinkId,
        kind: String(payload["kind"] ?? ""),
        target: scopedTarget,
        basedOn,
        payload: (payload["payload"] as Record<string, unknown>) ?? {},
        risk: String(payload["risk"] ?? "medium") as "low" | "medium" | "high" | "critical",
        reason: String(payload["reason"] ?? ""),
        expectedResult,
        idempotencyKey,
        expiresAt,
        // The user's approval of this tool call IS the approval of the stored
        // action; the record is persisted before the write, then executed and
        // verified through the same approve path.
        forceApproval: true,
      });
      const result = await runtime.approve(proposal.record.id);
      return {
        action_id: proposal.record.id,
        status: result.record.status,
        failure: result.error?.message,
        verification: result.verification?.evidence ?? [],
        summary: summarizeApprovedAction(result.record),
      };
    },
  };
}

function summarizeApprovedAction(record: Awaited<ReturnType<DeliveryActionRuntime["approve"]>>["record"]): string {
  if (record.status === "verified") {
    return `Action verified against Azure DevOps: ${record.kind} on ${record.target.kind} (evidence in verification).`;
  }
  if (record.failure) {
    return `Action ${record.status}: ${record.failure.message}`;
  }
  return `Action ended in status ${record.status}.`;
}

/**
 * Every write must carry verification predicates; when the model omits them
 * the tool derives a kind-appropriate re-read predicate so a write can never
 * be declared complete without re-reading ADO.
 */
function defaultPredicatesFor(
  kind: string,
  target: ArtifactRef,
  actionPayload: Record<string, unknown>,
): Array<{
  artifact: ArtifactRef;
  condition: "exists" | "field_eq" | "run_visible" | "comment_contains";
  field?: string;
  expected?: unknown;
  correlation?: string;
}> {
  if (kind === "work_item.comment") {
    const text = String(actionPayload["text"] ?? "");
    return text
      ? [{ artifact: target, condition: "comment_contains", expected: text }]
      : [{ artifact: target, condition: "exists" }];
  }
  if (kind === "work_item.create") {
    return [{
      artifact: target,
      condition: "field_eq",
      field: "System.Title",
      expected: String(actionPayload["title"] ?? ""),
    }];
  }
  if (kind === "pull_request.create") {
    return [{ artifact: target, condition: "exists" }];
  }
  if (kind === "pipeline.trigger") {
    return [{
      artifact: target,
      condition: "run_visible",
      correlation: String(actionPayload["sourceCommit"] ?? actionPayload["commit"] ?? ""),
    }];
  }
  return [{ artifact: target, condition: "exists" }];
}

/** The model provides kind + identity fields; projectLinkId is injected from context. */
function isScopedArtifactShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const kind = String(candidate["kind"] ?? "");
  if (kind === "work_item") return Number.isInteger(Number(candidate["id"] ?? 0)) && Number(candidate["id"]) > 0;
  if (kind === "pull_request") {
    // Creation targets carry no id yet; identity comes from the payload.
    return true;
  }
  if (kind === "build") {
    return Number.isInteger(Number(candidate["definitionId"] ?? candidate["definition_id"] ?? 0));
  }
  if (kind === "branch") {
    return Boolean(candidate["name"]) && Boolean(candidate["repositoryId"] ?? candidate["repository_id"]);
  }
  if (kind === "commit") {
    return Boolean(candidate["commitId"] ?? candidate["commit_id"]) && Boolean(candidate["repositoryId"] ?? candidate["repository_id"]);
  }
  return false;
}

function isVerificationPredicate(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate["artifact"] === "object"
    && candidate["artifact"] !== null
    && typeof candidate["condition"] === "string";
}

function createDeliveryRuntime(
  projectLinkId: string,
  organization: string,
  project: string,
): { runtime: DeliveryActionRuntime; transport: AdoActionTransport } {
  const transport = new AdoActionTransport({
    resolveProjectLink: async () => ({ organization, project }),
  });
  const runtime = new DeliveryActionRuntime(
    new SqliteDeliveryActionStore(),
    new DeliveryActionPolicy(),
    new DeliveryActionExecutor(transport),
    new ActionVerifier(transport),
    transport,
    { writesEnabled: () => deliveryWritesState.enabled },
  );
  return { runtime, transport };
}
