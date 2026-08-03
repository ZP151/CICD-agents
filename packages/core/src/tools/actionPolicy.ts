/**
 * ActionPolicy (MP-015).
 *
 * Sits in front of every native and MCP tool adapter. It decides
 * allow/approve/deny from the local CapabilityRegistry — server annotations
 * are advisory input and can never elevate trust. Product workflows keep the
 * final approval decision in the approval gate; this policy is the single
 * local decision source for tool-level gating.
 */
import type { CapabilityRecord } from "./capabilityRegistry.js";

export type ActionDecision = "allow" | "approve" | "deny";

export interface ActionRequest {
  capability: CapabilityRecord;
  /** explicit = the user asked for this exact operation in this turn. */
  userIntent: "explicit" | "implicit";
  /** Tool annotations from the server, carried for audit, never for trust. */
  annotations?: CapabilityRecord["annotations"];
}

export interface ActionVerdict {
  decision: ActionDecision;
  reason: string;
}

export class ActionPolicy {
  evaluate(request: ActionRequest): ActionVerdict {
    const { capability, userIntent } = request;
    if (capability.requiresApproval) {
      // Write/medium-high capabilities never execute without going through
      // the approval gate. Tool annotations claiming read-only must not
      // bypass this: they are server-supplied hints, not local policy.
      return {
        decision: userIntent === "explicit" ? "approve" : "deny",
        reason: userIntent === "explicit"
          ? "write capability with explicit user intent; route through approval"
          : "write capability without explicit user intent; propose an approval instead",
      };
    }
    if (capability.readOnly && capability.riskLevel === "low") {
      return { decision: "allow", reason: "read-only low-risk capability" };
    }
    return {
      decision: userIntent === "explicit" ? "approve" : "deny",
      reason: "unclassified capability; requires approval before execution",
    };
  }
}

export function actionVerdictForTool(
  policy: ActionPolicy,
  capability: CapabilityRecord | undefined,
  userIntent: "explicit" | "implicit",
): ActionVerdict {
  if (!capability) {
    return { decision: "deny", reason: "capability not registered; refusing unknown tool" };
  }
  return policy.evaluate({ capability, userIntent });
}
