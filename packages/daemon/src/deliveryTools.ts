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
      "Propose a persisted, verifiable Azure DevOps action (for example a work item comment). " +
      "The exact action is stored locally and shown for approval; after approval it is executed " +
      "once and verified by re-reading Azure DevOps. Returns the action id, status, and verification evidence.",
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
      if (!isArtifactRef(target)) {
        throw new ToolError("delivery_propose_action requires a valid target ArtifactRef.");
      }
      const basedOn = Array.isArray(payload["based_on"])
        ? (payload["based_on"] as unknown[]).filter(isArtifactRef)
        : [];
      const expectedResult = Array.isArray(payload["expected_result"])
        ? (payload["expected_result"] as unknown[])
            .filter(isVerificationPredicate)
            .map((predicate) => ({
              artifact: (predicate as { artifact: unknown }).artifact as ArtifactRef,
              condition: (predicate as { condition: string }).condition as "exists",
              field: (predicate as { field?: string }).field,
              expected: (predicate as { expected?: unknown }).expected,
              correlation: (predicate as { correlation?: string }).correlation,
              expectedRevision: (predicate as { expectedRevision?: number }).expectedRevision,
            }))
        : [];

      const runtime = createDeliveryRuntime(projectLinkId, organization, project);
      const idempotencyKey = String(payload["idempotency_key"] ?? "");
      const expiresAt = Number(payload["expires_at"] ?? 0);

      // Approved re-call: the same deterministic id resolves the stored
      // action and executes + verifies it, without model regeneration.
      const store = new SqliteDeliveryActionStore();
      const existing = await store.get(actionId(projectLinkId, idempotencyKey));
      if (existing && (existing.status === "awaiting_approval" || existing.status === "approved")) {
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
        target,
        basedOn,
        payload: (payload["payload"] as Record<string, unknown>) ?? {},
        risk: String(payload["risk"] ?? "medium") as "low" | "medium" | "high" | "critical",
        reason: String(payload["reason"] ?? ""),
        expectedResult,
        idempotencyKey,
        expiresAt,
      });
      return {
        action_id: proposal.record.id,
        status: proposal.record.status,
        decision: proposal.verdict.decision,
        reasons: proposal.verdict.reasons,
        summary: `Action proposed for approval (${proposal.record.kind}, risk ${proposal.record.risk}).`,
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
): DeliveryActionRuntime {
  const transport = new AdoActionTransport({
    resolveProjectLink: async () => ({ organization, project }),
  });
  return new DeliveryActionRuntime(
    new SqliteDeliveryActionStore(),
    new DeliveryActionPolicy(),
    new DeliveryActionExecutor(transport),
    new ActionVerifier(transport),
    transport,
    { writesEnabled: () => deliveryWritesState.enabled },
  );
}
