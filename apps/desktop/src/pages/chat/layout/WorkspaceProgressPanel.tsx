import type { WorkflowEventState } from "../chat.types.js";
import type { TaskState, WorkspaceAction } from "../workflowTaskState.js";
import { WorkflowProgressList } from "./WorkflowProgressList.js";

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
      <WorkflowProgressList
        taskState={taskState}
        workflowState={workflowState}
        busy={busy}
        onAction={onAction}
      />
    </div>
  );
}
