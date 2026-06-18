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

interface WorkspaceProgressPanelProps {
  taskState: TaskState | null;
  workflowState: WorkflowEventState | null;
  busy: boolean;
  onAction: (action: WorkspaceAction) => void;
}

export function WorkspaceProgressPanel({
  taskState,
  workflowState,
  busy,
  onAction,
}: WorkspaceProgressPanelProps) {
  return (
    <div className="mt-4 border-t border-[rgb(var(--app-border))] pt-4">
      <p className="mb-2 text-sm text-[rgb(var(--app-text-muted))]">Progress</p>
      {taskState ? (
        <div className="space-y-2">
          {taskState.steps.map((step, index) => {
            const actionState = workflowStepActionState(step, {
              busy,
              workflowStatus: workflowState?.status,
            });
            return (
              <div key={index} className="flex items-start gap-2 text-sm text-[rgb(var(--app-text-muted))]">
                <span className={workflowStepDotClass(step, actionState)} />
                {step.action ? (
                  <button
                    type="button"
                    onClick={() => onAction(step.action!)}
                    disabled={workflowStepActionDisabled(actionState)}
                    className={workflowStepActionClass(step, actionState)}
                    data-workflow-step-state={actionState}
                    title={workflowStepActionTitle(step, actionState, workflowState)}
                  >
                    <span className="min-w-0 truncate">{step.label}</span>
                    {actionState !== "idle" && (
                      <span className={workflowStepActionBadgeClass(actionState)}>
                        {workflowStepActionBadgeLabel(actionState)}
                      </span>
                    )}
                  </button>
                ) : (
                  <span className={step.done ? "text-[rgb(var(--app-text-subtle))] line-through" : ""}>{step.label}</span>
                )}
              </div>
            );
          })}
          {taskState.details && taskState.details.length > 0 && (
            <div className="border-t border-[rgb(var(--app-border))] pt-2 text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
              {taskState.details.map((detail, index) => (
                <p key={index} className="truncate" title={detail}>{detail}</p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-[rgb(var(--app-text-subtle))]">
          Ask MergePilot to inspect changes, run CI/CD checks, analyze PR insight, or prepare a commit.
        </p>
      )}
    </div>
  );
}
