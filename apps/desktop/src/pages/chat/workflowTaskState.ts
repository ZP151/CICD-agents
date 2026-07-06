import type { WorkflowEventState } from "./chat.types.js";
import type {
  GitRecoveryWorkspaceAction,
  WorkflowStep,
  WorkflowStepActionState,
  WorkflowStepActionStateContext,
} from "./workflowTaskTypes.js";

export type {
  GitRecoveryWorkspaceAction,
  TaskState,
  WorkflowStep,
  WorkflowStepActionState,
  WorkflowStepActionStateContext,
  WorkspaceAction,
} from "./workflowTaskTypes.js";

export {
  taskStateFromWorkflow,
  workflowStateWithActionSummary,
} from "./workflowTaskDerivation.js";

export function workflowStepActionState(
  step: WorkflowStep,
  context: WorkflowStepActionStateContext,
): WorkflowStepActionState {
  if (context.workflowStatus === "blocked" && step.action && isGitRecoveryAction(step.action.type)) return "idle";
  if (context.workflowStatus === "blocked") return "blocked";
  const workflowBusy = Boolean(
    context.busy
      || context.workflowStatus === "planning"
      || context.workflowStatus === "running",
  );
  if (workflowBusy && step.active) return "running";
  if (workflowBusy) return "waiting";
  if (step.done) return "done";
  return "idle";
}

function isGitRecoveryAction(type: string): boolean {
  return type === "continue_rebase"
    || type === "abort_rebase"
    || type === "skip_rebase"
    || type === "continue_merge"
    || type === "abort_merge"
    || type === "continue_cherry_pick"
    || type === "abort_cherry_pick"
    || type === "skip_cherry_pick"
    || type === "continue_revert"
    || type === "abort_revert"
    || type === "skip_revert";
}

export function gitRecoveryPanelState(workflowState: WorkflowEventState | null): {
  label: string;
  actions: Array<{ type: GitRecoveryWorkspaceAction["type"]; label: string; title: string }>;
} | null {
  if (workflowState?.workflowKind !== "git") return null;
  const phase = workflowState.workflowPhase ?? "";
  if (phase.includes("rebase")) {
    return {
      label: "Rebase",
      actions: [
        { type: "continue_rebase", label: "Continue", title: "Continue the in-progress rebase" },
        { type: "abort_rebase", label: "Abort", title: "Abort the in-progress rebase" },
        { type: "skip_rebase", label: "Skip", title: "Skip the current rebase patch" },
      ],
    };
  }
  if (phase.includes("merge")) {
    return {
      label: "Merge",
      actions: [
        { type: "continue_merge", label: "Continue", title: "Continue the in-progress merge" },
        { type: "abort_merge", label: "Abort", title: "Abort the in-progress merge" },
      ],
    };
  }
  if (phase.includes("cherry_pick")) {
    return {
      label: "Cherry-pick",
      actions: [
        { type: "continue_cherry_pick", label: "Continue", title: "Continue the in-progress cherry-pick" },
        { type: "abort_cherry_pick", label: "Abort", title: "Abort the in-progress cherry-pick" },
        { type: "skip_cherry_pick", label: "Skip", title: "Skip the current cherry-pick patch" },
      ],
    };
  }
  if (phase.includes("revert")) {
    return {
      label: "Revert",
      actions: [
        { type: "continue_revert", label: "Continue", title: "Continue the in-progress revert" },
        { type: "abort_revert", label: "Abort", title: "Abort the in-progress revert" },
        { type: "skip_revert", label: "Skip", title: "Skip the current revert patch" },
      ],
    };
  }
  return null;
}
