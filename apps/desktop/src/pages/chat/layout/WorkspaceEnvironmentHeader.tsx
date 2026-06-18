import type { WorkspaceAction } from "../workflowTaskState.js";

interface WorkspaceEnvironmentHeaderProps {
  hasRepoPath: boolean;
  busy: boolean;
  runAction: (action: WorkspaceAction) => void;
}

export function WorkspaceEnvironmentHeader({
  hasRepoPath,
  busy,
  runAction,
}: WorkspaceEnvironmentHeaderProps) {
  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
      <p className="min-w-0 truncate text-sm text-[rgb(var(--app-text-muted))]">Environment</p>
      <button
        type="button"
        onClick={() => runAction({ type: "inspect_environment" })}
        disabled={!hasRepoPath || busy}
        className="shrink-0 rounded-md p-1 text-[rgb(var(--app-text-subtle))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-default disabled:opacity-45"
        title="Inspect environment"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
            d="M10.3 4.3l.7-1.3h2l.7 1.3 1.5.6 1.4-.4 1.4 1.4-.4 1.4.6 1.5 1.3.7v2l-1.3.7-.6 1.5.4 1.4-1.4 1.4-1.4-.4-1.5.6-.7 1.3h-2l-.7-1.3-1.5-.6-1.4.4-1.4-1.4.4-1.4-.6-1.5-1.3-.7v-2l1.3-.7.6-1.5-.4-1.4 1.4-1.4 1.4.4 1.5-.6z"
          />
          <circle cx="12" cy="11" r="2.6" strokeWidth={1.7} />
        </svg>
      </button>
    </div>
  );
}
