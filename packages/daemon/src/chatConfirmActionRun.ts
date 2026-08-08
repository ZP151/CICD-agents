import { type ChatEvent, SqliteDeliveryActionStore, type ChatVerifiedAction } from "@mergepilot/core";
import type { ActiveChatSessions } from "./chatActiveSessions.js";
import {
  markStoredApprovalProposalRunning,
  resolveStoredApprovalProposal,
} from "./chatApprovalProposals.js";
import {
  streamAndPersistConfirmedAction,
  type ConfirmedActionPersistenceAdapters,
} from "./chatConfirmedActions.js";
import { streamConfirmedActionOutcome } from "./chatConfirmedOutcome.js";
import {
  runVerifiedChatAction,
  verifiedActionsForSession,
} from "./chatVerifiedActionRuntime.js";
import {
  storedSessionProjectLinkId,
} from "./chatHistoryStore.js";
import {
  type PlannerContinuationAdapters,
} from "./chatPlannerContinuation.js";
import { createChatRuntimeSetup, type ChatRuntimeSetup } from "./chatRuntimeSetup.js";
import { approvalIdFor } from "./chatWorkflowState.js";

export interface RunConfirmedChatActionArgs {
  active: ActiveChatSessions;
  sessionId: string;
  plannerAdapters: PlannerContinuationAdapters;
  persistenceAdapters: ConfirmedActionPersistenceAdapters;
  /** ADR-0005 runtime PAT source; re-injects the credential for this execution only. */
  patInjector?: (id: string) => Promise<string>;
}

export async function* runConfirmedChatAction(args: RunConfirmedChatActionArgs): AsyncGenerator<ChatEvent> {
  const { active, persistenceAdapters, plannerAdapters, sessionId } = args;
  const resolved = await resolveStoredApprovalProposal(sessionId);

  if (!resolved) {
    yield { type: "error", message: "No approval proposal for this session" };
    return;
  }
  const { storedSession, pending } = resolved;

  active.start(sessionId, storedSession.repoPath);

  let runtime: ChatRuntimeSetup | null = null;
  try {
    const workflowState = await markStoredApprovalProposalRunning(storedSession, pending);

    // Credential containment (ADR-0005, 4a-1): the stored snapshot's
    // inlineProjectLink is redacted at save time, so the executing turn must
    // re-inject the runtime value. This runs AFTER the running-transition
    // save above — normalizeSession replaces the in-memory inlineProjectLink
    // with a redacted clone on save, which would otherwise strip the injected
    // PAT before the runtime is built. It mutates only the in-memory snapshot;
    // nothing is written back to the persisted session.
    if (storedSession.inlineProjectLink && args.patInjector) {
      const pat = await args.patInjector(storedSession.inlineProjectLink.id ?? "");
      if (pat) storedSession.inlineProjectLink.adoPat = pat;
    }

    const session = active.get(sessionId)!;
    yield { type: "approval_resolved", approvalId: approvalIdFor(pending), approved: true };
    yield { type: "workflow_state", state: workflowState };

    runtime = await createChatRuntimeSetup({
      repoPath: session.repoPath,
      llmConfig: storedSession.llmConfig,
      inlineProjectLink: storedSession.inlineProjectLink,
      projectLinkId: storedSessionProjectLinkId(storedSession),
    });
    const { llm, planner, actionExecutor } = runtime;

    const toolCallId = approvalIdFor(pending);
    const projectLinkId = storedSessionProjectLinkId(storedSession) ?? sessionId;
    const verifiedActions: ChatVerifiedAction[] = [];

    let ok: boolean;
    let toolResult: unknown;
    let summary: string;

    if (pending.tool.startsWith("git_")) {
      // Chat git writes run the canonical ActionRecord lifecycle (Proposal →
      // Approval → Execution → Re-read → Verification). The action store is
      // the shared per-machine ledger; the verified records are projected into
      // the workflow state below.
      const store = new SqliteDeliveryActionStore();
      const result = yield* runVerifiedChatAction({
        sessionId,
        repoPath: session.repoPath,
        projectLinkId,
        pending,
        actionExecutor,
        toolCallId,
        inlineProjectLink: storedSession.inlineProjectLink,
        adapters: persistenceAdapters,
        store,
      });
      ok = result.ok;
      toolResult = result.toolResult;
      summary = result.summary;
      verifiedActions.push(...(await verifiedActionsForSession(store, sessionId)));
    } else {
      // Non-git confirmed tools (ADO / MCP writes) keep the direct execution
      // path in this slice; the canonical verified path for ADO writes is
      // delivery_propose_action, which the planner is instructed to prefer.
      // Tracked in next-iteration-known-gaps.md.
      const legacy = yield* streamAndPersistConfirmedAction({
        sessionId,
        actionExecutor,
        pending,
        toolCallId,
        historyLabel: "confirmed & executed",
        adapters: persistenceAdapters,
      });
      ok = legacy.ok;
      toolResult = legacy.toolResult;
      summary = legacy.summary;
    }
    yield* streamConfirmedActionOutcome({
      sessionId,
      repoPath: session.repoPath,
      pending,
      ok,
      toolResult,
      summary,
      llm,
      planner,
      inlineProjectLink: storedSession.inlineProjectLink,
      projectLinkId,
      verifiedActions,
      adapters: plannerAdapters,
    });
  } finally {
    await runtime?.close();
    active.finish(sessionId);
  }
}
