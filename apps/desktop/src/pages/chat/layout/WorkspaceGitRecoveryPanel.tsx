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
    <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
      <p className="mb-2 truncate text-xs text-amber-700 dark:text-amber-300">
        {gitRecovery.label} needs attention
      </p>
      <div className={`grid gap-1 ${gitRecovery.actions.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
        {gitRecovery.actions.map((action) => (
          <button
            key={action.type}
            type="button"
            onClick={() => runAction({ type: action.type })}
            disabled={busy}
            className="truncate whitespace-nowrap rounded-md border border-amber-500/30 px-1.5 py-1 text-[10px] text-amber-800 transition hover:bg-amber-500/15 disabled:cursor-wait disabled:opacity-50 dark:text-amber-200"
            title={action.title}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
