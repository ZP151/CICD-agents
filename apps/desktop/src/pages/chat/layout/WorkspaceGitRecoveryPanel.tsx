import type {
  GitRecoveryWorkspaceAction,
  WorkspaceAction,
} from "../workflowTaskState.js";

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
    <div className="mt-2 rounded-lg border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] p-2">
      <p className="mb-2 truncate text-xs text-[rgb(var(--app-warning))]">
        {gitRecovery.label} needs attention
      </p>
      <div className={workspaceGitRecoveryActionsGridClass()}>
        {gitRecovery.actions.map((action) => (
          <button
            key={action.type}
            type="button"
            onClick={() => runAction({ type: action.type })}
            disabled={busy}
            className="truncate whitespace-nowrap rounded-md border border-[rgb(var(--app-warning-border))] px-1.5 py-1 text-[10px] text-[rgb(var(--app-warning))] transition hover:bg-[rgb(var(--app-surface))] disabled:cursor-wait disabled:opacity-50"
            title={action.title}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function workspaceGitRecoveryActionsGridClass(): string {
  return "grid min-w-0 gap-1 grid-cols-[repeat(auto-fit,minmax(min(100%,5.75rem),1fr))]";
}
