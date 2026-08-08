import {
  type ChatEvent,
  type ChatPlanner,
  type ChatPlannerResult,
  type ChatVerifiedAction,
  type LLMClient,
  type PendingToolAction,
} from "@mergepilot/core";
import type { InlineProjectLink } from "./chatHistoryStore.js";
import {
  streamPlannerContinuation,
  type PlannerContinuationAdapters,
} from "./chatPlannerContinuation.js";
import {
  buildWorkflowState,
  nextStructuredApprovalAfterConfirmedAction,
  setStoredApprovalProposal,
  structuredDoneAfterConfirmedAction,
} from "./chatWorkflowState.js";
import {
  gitOperationBlockForAction,
  gitOperationStateFromTools,
} from "./workflows/gitOperation.js";
import { runGitWorkflowProbes } from "./workflows/gitProbes.js";

export interface ConfirmedActionOutcomeArgs {
  sessionId: string;
  repoPath: string;
  pending: PendingToolAction;
  ok: boolean;
  toolResult: unknown;
  summary: string;
  llm: LLMClient;
  planner: ChatPlanner;
  inlineProjectLink?: InlineProjectLink;
  projectLinkId?: string;
  /** Canonical ActionRecords for this turn; projected into every workflow_state emitted. */
  verifiedActions?: ChatVerifiedAction[];
  adapters: PlannerContinuationAdapters;
}

export async function* streamConfirmedActionOutcome(
  args: ConfirmedActionOutcomeArgs,
): AsyncGenerator<ChatEvent> {
  const {
    adapters,
    inlineProjectLink,
    llm,
    ok,
    pending,
    planner,
    repoPath,
    sessionId,
    summary,
    toolResult,
    verifiedActions,
  } = args;

  const structuredNext = ok
    ? await nextStructuredApprovalAfterConfirmedAction(pending, repoPath)
    : undefined;
  if (structuredNext) {
    const sessionForNext = await adapters.loadSession(sessionId);
    if (sessionForNext) {
      setStoredApprovalProposal(sessionForNext, structuredNext.proposal);
      const workflowState = buildWorkflowState(
        sessionForNext.bubbles,
        structuredNext.proposal,
        "waiting_for_approval",
        structuredNext.currentStep,
        structuredNext.riskLevel,
        structuredNext.explanation,
        {},
        verifiedActions ?? [],
      );
      sessionForNext.workflowState = workflowState;
      await adapters.saveSession(sessionForNext);
      yield { type: "workflow_state", state: workflowState };
      if (workflowState.pendingApproval) {
        yield { type: "approval_required", approval: workflowState.pendingApproval };
      }
      return;
    }
  }

  const structuredDone = ok ? structuredDoneAfterConfirmedAction(pending, toolResult) : undefined;
  if (structuredDone) {
    const sessionForDone = await adapters.loadSession(sessionId);
    if (sessionForDone) {
      setStoredApprovalProposal(sessionForDone, undefined);
      const workflowState = buildWorkflowState(
        sessionForDone.bubbles,
        undefined,
        "done",
        structuredDone.currentStep,
        "medium",
        "",
        {
          workflowKind: structuredDone.workflowKind,
          workflowPhase: structuredDone.workflowPhase,
        },
        verifiedActions ?? [],
      );
      sessionForDone.workflowState = workflowState;
      await adapters.saveSession(sessionForDone);
      await adapters.appendBubble(sessionId, {
        role: "assistant",
        content: structuredDone.result.response,
        timestamp: now(),
        riskLevel: structuredDone.result.riskLevel,
        finalizationMode: structuredDone.result.finalizationMode,
        actionsTaken: structuredDone.result.actionsTaken,
        suggestions: structuredDone.result.suggestions,
        artifacts: structuredDone.result.artifacts,
      });
      yield { type: "workflow_state", state: workflowState };
      yield { type: "done", result: structuredDone.result };
      return;
    }
  }

  const gitRecovery = !ok
    ? await gitRecoveryAfterFailedConfirmedAction(pending, repoPath, summary)
    : undefined;
  if (gitRecovery) {
    const sessionForRecovery = await adapters.loadSession(sessionId);
    if (sessionForRecovery) {
      setStoredApprovalProposal(sessionForRecovery, undefined);
      const workflowState = buildWorkflowState(
        sessionForRecovery.bubbles,
        undefined,
        "blocked",
        gitRecovery.currentStep,
        "medium",
        "",
        {
          workflowKind: "git",
          workflowPhase: gitRecovery.workflowPhase,
        },
        verifiedActions ?? [],
      );
      sessionForRecovery.workflowState = workflowState;
      await adapters.saveSession(sessionForRecovery);
      await adapters.appendBubble(sessionId, {
        role: "assistant",
        content: gitRecovery.result.response,
        timestamp: now(),
        riskLevel: gitRecovery.result.riskLevel,
        finalizationMode: gitRecovery.result.finalizationMode,
        actionsTaken: gitRecovery.result.actionsTaken,
        suggestions: gitRecovery.result.suggestions,
      });
      yield { type: "workflow_state", state: workflowState };
      yield { type: "done", result: gitRecovery.result };
      return;
    }
  }

  yield* streamPlannerContinuation({
    sessionId,
    message: continuationMessage(pending, ok, summary),
    repoPath,
    historyLimit: 22,
    llm,
    planner,
    inlineProjectLink,
    projectLinkId: args.projectLinkId,
    persistUserMessage: true,
    waitForConfirm: () => Promise.resolve(true),
    contextProgressMessage: "Refreshing project context",
    planningProgressMessage: "Planning next step",
    adapters,
  });
}

async function gitRecoveryAfterFailedConfirmedAction(
  pending: PendingToolAction,
  repoPath: string,
  failureSummary: string,
): Promise<
  | {
      currentStep: string;
      workflowPhase: string;
      result: ChatPlannerResult;
    }
  | undefined
> {
  if (pending.workflow?.kind !== "git" && !pending.tool.startsWith("git_")) return undefined;
  const probes = await runGitWorkflowProbes(repoPath, "stage_resolved_conflicts");
  const statusText = probes.tools.find((tool) => tool.name === "git_status")?.stdout ?? "";
  const operationState = gitOperationStateFromTools(repoPath, statusText, probes.tools);
  const block = gitOperationBlockForAction("prepare_commit", operationState);
  if (!block) {
    if (pending.tool === "git_commit")
      return failedCommitValidationRecovery(pending, statusText, failureSummary);
    return undefined;
  }
  const suggestions =
    operationState.phase === "rebase"
      ? ["Resolve conflicts", "Stage resolved conflict files", "Continue rebase", "Abort rebase"]
      : operationState.phase === "merge"
        ? ["Resolve conflicts", "Stage resolved conflict files", "Continue merge", "Abort merge"]
        : ["Inspect Git status", "Resolve conflicted files", "Stage resolved conflict files"];
  return {
    currentStep: block.summary,
    workflowPhase: block.workflowPhase,
    result: {
      response: block.summary,
      finalizationMode: "none",
      riskLevel: "medium",
      actionsTaken: [`Stopped after ${pending.tool}`],
      suggestions,
      toolCallsMade: [{ name: pending.tool, args: pending.args, ok: false }],
      usedLlm: false,
    },
  };
}

function failedCommitValidationRecovery(
  pending: PendingToolAction,
  statusText: string,
  failureSummary: string,
): {
  currentStep: string;
  workflowPhase: string;
  result: ChatPlannerResult;
} {
  const staged = stagedPathsFromStatus(statusText);
  const stagedText =
    staged.length > 0
      ? `Staged changes are still staged: ${staged.slice(0, 8).join(", ")}${staged.length > 8 ? ", ..." : ""}.`
      : "No staged paths were detected after the failed commit.";
  const reason = firstMeaningfulLine(failureSummary);
  const response = [
    "Commit failed before a new commit was created.",
    stagedText,
    reason ? `Failure evidence: ${reason}` : "",
    "Fix the validation error, then retry the commit. Use bypass flags only if you explicitly decide that is safe for this repository.",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    currentStep: "Commit failed; staged changes were preserved.",
    workflowPhase: "commit_failed",
    result: {
      response,
      finalizationMode: "none",
      riskLevel: "medium",
      actionsTaken: [`Stopped after ${pending.tool}`],
      suggestions: ["Inspect staged changes", "Fix validation failure", "Retry commit"],
      toolCallsMade: [{ name: pending.tool, args: pending.args, ok: false }],
      usedLlm: false,
    },
  };
}

function stagedPathsFromStatus(statusText: string): string[] {
  return statusText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith("## "))
    .filter((line) => line.length >= 4 && line[0] !== " " && line[0] !== "?")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

function firstMeaningfulLine(text: string): string {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    for (const key of ["stderr", "stdout", "error"]) {
      const value = parsed[key];
      if (typeof value !== "string") continue;
      const line = firstMeaningfulLine(value);
      if (line) return line;
    }
  } catch {
    // Fall through to plain-text extraction.
  }
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && !/^\{.*\}$/.test(line)) ?? ""
  );
}

function continuationMessage(pending: PendingToolAction, ok: boolean, summary: string): string {
  const nextHint = pending.nextHint ?? "continue workflow";
  return ok
    ? `WORKFLOW STEP COMPLETED: ${pending.tool} executed successfully. Result: ${summary}. ` +
        `Next workflow step is: "${nextHint}". ` +
        `CRITICAL: Do NOT call git_status, git_diff, git_log, git_branch_list, git_current_branch, or git_remote again. ` +
        `The working tree state is already known. ` +
        `Proceed DIRECTLY to: ${nextHint}. ` +
        `If the next step requires user confirmation, propose it with approval_proposal in your JSON.`
    : `WORKFLOW STEP FAILED: ${pending.tool} failed with error: ${summary}. Explain what went wrong and propose a recovery action.`;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}
