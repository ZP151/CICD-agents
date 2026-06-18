import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import { runChatWorkflowAction } from "../../api.js";
import {
  conversationPartsFromAssistantBubble,
  toolCallPartFromSnapshot,
  type AssistantBubbleMeta,
} from "../../chatBubbles.js";
import { workflowActionArtifactsFromResult } from "./artifacts/conversationArtifacts.js";
import type { ApprovalRequest, Bubble, WorkflowEventState } from "./chat.types.js";
import {
  makeToolCallId,
  toolPartStateFromResult,
} from "./chatToolStreamState.js";
import { uid } from "./chatStreamDispatcher.js";
import { reduceChatBubbles } from "./chatBubbleReducer.js";
import type { WorkspaceAction } from "./workflowTaskState.js";
import { workflowStateWithActionSummary } from "./workflowTaskState.js";
import {
  workspaceActionMatchesApproval,
  workspaceActionToolCandidates,
} from "./workspaceActionTools.js";
import { workspaceActionToDirectWorkflow } from "./workspaceActionWorkflow.js";

export interface UseWorkspaceActionRuntimeArgs {
  activeProjectLinkId: string | null;
  addBubble: (bubble: Bubble, options?: { forceScroll?: boolean }) => void;
  bubbles: Bubble[];
  busy: boolean;
  confirmPendingAction: (bubbleId: string) => void;
  repoPath: string;
  sessionId: string | null;
  showApprovalRequest: (approval: ApprovalRequest) => void;
  statusText: string | null;
  workflowState: WorkflowEventState | null;
  setBubbles: Dispatch<SetStateAction<Bubble[]>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setStatusText: Dispatch<SetStateAction<string | null>>;
  setWorkflowState: Dispatch<SetStateAction<WorkflowEventState | null>>;
}

export interface WorkspaceActionRuntime {
  runWorkspaceAction: (action: WorkspaceAction) => Promise<void>;
}

export function useWorkspaceActionRuntime(args: UseWorkspaceActionRuntimeArgs): WorkspaceActionRuntime {
  const runWorkspaceAction = useCallback(async (action: WorkspaceAction) => {
    const candidateTools = workspaceActionToolCandidates(action);
    const matchingPendingBubble = [...args.bubbles].reverse().find(
      (bubble) =>
        bubble.kind === "pending_confirm" &&
        (bubble.pendingStatus ?? "waiting") === "waiting" &&
        bubble.pendingTool &&
        candidateTools.includes(bubble.pendingTool),
    );

    if (matchingPendingBubble) {
      if (args.busy) {
        args.setStatusText("Current workflow is still updating the approval state.");
        return;
      }
      args.confirmPendingAction(matchingPendingBubble.id);
      return;
    }

    const pendingApproval = args.workflowState?.pendingApproval;
    if (pendingApproval) {
      if (workspaceActionMatchesApproval(action, pendingApproval)) {
        args.setStatusText(`Waiting for approval: ${pendingApproval.action.description}`);
      } else {
        args.setStatusText(`Finish current approval first: ${pendingApproval.action.description}`);
      }
      return;
    }

    if (args.busy || args.workflowState?.status === "planning" || args.workflowState?.status === "running") {
      args.setStatusText(args.statusText ? `Workflow already active: ${args.statusText}` : "Workflow already active");
      return;
    }

    if (args.workflowState?.status === "blocked") {
      args.setStatusText(`Workflow blocked: ${args.workflowState.currentStep}`);
      return;
    }

    if (!args.repoPath.trim()) return;

    const directWorkflow = workspaceActionToDirectWorkflow(action);
    args.setBusy(true);
    args.setStatusText("Inspecting workspace");
    try {
      const result = await runChatWorkflowAction(directWorkflow.action, args.repoPath, args.activeProjectLinkId, {
        sessionId: args.sessionId,
        ...directWorkflow.input,
      });
      if (result.sessionId) args.setSessionId(result.sessionId);
      args.setWorkflowState(workflowStateWithActionSummary(result.workflowState ?? null, result.summary));

      const workflowArtifacts = workflowActionArtifactsFromResult(result.artifacts);
      const resultBubbleMeta: AssistantBubbleMeta | undefined = workflowArtifacts.length
        ? { artifacts: workflowArtifacts }
        : undefined;
      const resultBubble: Bubble = workflowArtifacts.length
        ? {
            id: uid(),
            kind: result.ok ? "assistant" : "error",
            text: result.summary,
            meta: resultBubbleMeta,
            parts: conversationPartsFromAssistantBubble({ text: result.summary, meta: resultBubbleMeta }),
          }
        : {
            id: uid(),
            kind: result.ok ? "system" : "error",
            text: result.summary,
          };

      const resultBubbles: Bubble[] = [
        ...result.tools.map((tool) => {
          const toolCallId = makeToolCallId(tool.name);
          const toolArgs = { command: tool.command };
          const toolResult = {
            stdout: tool.stdout,
            stderr: tool.stderr,
            returncode: tool.returncode,
          };
          const toolSummary = tool.ok ? tool.stdout.trim().split(/\r?\n/)[0] || "ok" : tool.stderr || "failed";
          return {
            id: uid(),
            kind: "tool" as const,
            toolCallId,
            toolName: tool.name,
            toolArgs,
            toolOk: tool.ok,
            toolSummary,
            toolResult,
            toolOpen: false,
            parts: [
              toolCallPartFromSnapshot({
                toolCallId,
                toolName: tool.name,
                state: toolPartStateFromResult(tool.ok),
                input: toolArgs,
                output: toolResult,
                summary: toolSummary,
              }),
            ],
          };
        }),
        resultBubble,
      ];
      args.setBubbles((prev) => reduceChatBubbles(prev, { type: "add_many", bubbles: resultBubbles }, uid));

      if (result.workflowState?.pendingApproval) {
        args.showApprovalRequest(result.workflowState.pendingApproval);
      }
    } catch (err) {
      args.addBubble({ id: uid(), kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      args.setBusy(false);
      args.setStatusText(null);
    }
  }, [
    args.activeProjectLinkId,
    args.addBubble,
    args.bubbles,
    args.busy,
    args.confirmPendingAction,
    args.repoPath,
    args.sessionId,
    args.setBubbles,
    args.setBusy,
    args.setSessionId,
    args.setStatusText,
    args.setWorkflowState,
    args.showApprovalRequest,
    args.statusText,
    args.workflowState,
  ]);

  return useMemo(() => ({ runWorkspaceAction }), [runWorkspaceAction]);
}
