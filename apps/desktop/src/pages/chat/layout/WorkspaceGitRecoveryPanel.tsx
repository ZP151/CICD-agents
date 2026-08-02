import type {
  GitRecoveryWorkspaceAction,
  WorkspaceAction,
} from "../workflowTaskState.js";
import {
  ActionButton,
  InlineNotice,
} from "../../../components/workbench/WorkbenchPrimitives.js";

interface WorkspaceGitRecoveryPanelProps {
  gitRecovery: {
    label: string;
    actions: Array<{
      type: GitRecoveryWorkspaceAction["type"];
      label: string;
      title: string;
    }>;
  } | null;
  busy: boolean;
  runAction: (action: WorkspaceAction) => void;
}

export function WorkspaceGitRecoveryPanel({
  gitRecovery,
  busy,
  runAction,
}: WorkspaceGitRecoveryPanelProps) {
  if (!gitRecovery) return null;

  return (
    <InlineNotice tone="warning" title={`${gitRecovery.label} needs attention`}>
      <div className={workspaceGitRecoveryActionsGridClass()}>
        {gitRecovery.actions.map((action) => (
          <ActionButton
            key={action.type}
            type="button"
            onClick={() => runAction({ type: action.type })}
            disabled={busy}
            tone="quiet"
            className="min-h-7 truncate whitespace-nowrap border border-[rgb(var(--app-warning-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-warning))] hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-warning))] disabled:cursor-wait"
            aria-label={action.title}
          >
            {action.label}
          </ActionButton>
        ))}
      </div>
    </InlineNotice>
  );
}

export function workspaceGitRecoveryActionsGridClass(): string {
  return "grid min-w-0 gap-1 grid-cols-[repeat(auto-fit,minmax(min(100%,5.75rem),1fr))]";
}
