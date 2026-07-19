import type { WorkspaceAction } from "../workflowTaskState.js";

interface WorkspaceChangesButtonProps {
  hasRepoPath: boolean;
  busy: boolean;
  statusText: string | null;
  gitKnown: boolean;
  hasChanges: boolean;
  added: number;
  removed: number;
  runAction: (action: WorkspaceAction) => void;
}

export function WorkspaceChangesButton({
  hasRepoPath,
  busy,
  statusText,
  gitKnown,
  hasChanges,
  added,
  removed,
  runAction,
}: WorkspaceChangesButtonProps) {
  return (
    <button
      type="button"
      onClick={() => runAction({ type: "inspect_changes" })}
      disabled={!hasRepoPath || busy}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md px-1 py-1.5 text-left transition hover:bg-[rgb(var(--app-surface-raised))] disabled:cursor-default disabled:opacity-70"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M7 7h10M7 12h10M7 17h7M5 4h14v16H5z" />
        </svg>
        <span className="min-w-0 truncate">Changes</span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-right font-mono text-xs">
        {busy && statusText ? (
          <span className="text-[rgb(var(--app-accent-readable))]">running</span>
        ) : !gitKnown ? (
          <span className="text-[rgb(var(--app-text-subtle))]">not checked</span>
        ) : hasChanges ? (
          <>
            <span className="text-[rgb(var(--app-success))]">+{added}</span>
            <span className="ml-1 text-[rgb(var(--app-danger))]">-{removed}</span>
          </>
        ) : (
          <span className="text-[rgb(var(--app-text-subtle))]">clean</span>
        )}
      </span>
    </button>
  );
}
