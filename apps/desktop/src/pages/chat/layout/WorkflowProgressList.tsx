import type { WorkflowEventState } from "../chat.types.js";
import type {
  TaskState,
  WorkspaceAction,
} from "../workflowTaskState.js";
import { workflowStepActionState } from "../workflowTaskState.js";
import {
  workflowStepActionBadgeClass,
  workflowStepActionBadgeLabel,
  workflowStepActionClass,
  workflowStepActionDisabled,
  workflowStepActionTitle,
  workflowStepDotClass,
} from "./workflowStepPresentation.js";

interface WorkflowProgressListProps {
  taskState: TaskState | null;
  workflowState: WorkflowEventState | null;
  busy: boolean;
  onAction: (action: WorkspaceAction) => void;
  compact?: boolean;
  showDetails?: boolean;
}

/**
 * The same workflow state is surfaced in the pinned summary and the workspace
 * panel. Keeping the rows here ensures that action state, focus and wording
 * cannot drift between those two views.
 */
export function WorkflowProgressList({
  taskState,
  workflowState,
  busy,
  onAction,
  compact = false,
  showDetails = true,
}: WorkflowProgressListProps) {
  const rowTextSize = compact ? "text-xs" : "text-sm";

  if (!taskState) {
    return (
      <p className={`${rowTextSize} leading-relaxed text-[rgb(var(--app-text-subtle))]`}>
        Ask MergePilot to inspect changes, run CI/CD checks, analyze PR insight, or prepare a commit.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {taskState.steps.map((step, index) => {
        const actionState = workflowStepActionState(step, {
          busy,
          workflowStatus: workflowState?.status,
        });
        const actionLabel = workflowStepActionTitle(step, actionState, workflowState);
        return (
          <div key={index} className={`flex items-start gap-2 ${rowTextSize} text-[rgb(var(--app-text-muted))]`}>
            <span className={workflowStepDotClass(step, actionState)} />
            {step.action ? (
              <button
                type="button"
                aria-label={actionLabel}
                onClick={() => onAction(step.action!)}
                disabled={workflowStepActionDisabled(actionState)}
                className={workflowStepActionClass(step, actionState)}
                data-workflow-step-state={actionState}
              >
                <span className="min-w-0 truncate">{step.label}</span>
                {actionState !== "idle" && (
                  <span className={workflowStepActionBadgeClass(actionState)}>
                    {workflowStepActionBadgeLabel(actionState)}
                  </span>
                )}
              </button>
            ) : (
              <span className={step.done ? "min-w-0 text-[rgb(var(--app-text-subtle))] line-through" : "min-w-0"}>{step.label}</span>
            )}
          </div>
        );
      })}
      {showDetails && taskState.details && taskState.details.length > 0 && (
        <div className="border-t border-[rgb(var(--app-border))] pt-2 text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
          {taskState.details.map((detail, index) => <p key={index} className="truncate" title={detail}>{detail}</p>)}
        </div>
      )}
    </div>
  );
}
