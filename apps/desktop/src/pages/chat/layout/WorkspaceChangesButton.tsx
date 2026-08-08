import type { WorkspaceAction } from "../workflowTaskState.js";
import { ActionButton } from "../../../components/workbench/WorkbenchPrimitives.js";

interface WorkspaceChangesButtonProps {
  hasRepoPath: boolean;
  busy: boolean;
  runAction: (action: WorkspaceAction) => void;
}

/**
 * Entry point for inspecting repository changes. Context deliberately shows
 * no +added/-removed counts or clean/not-checked status; the git tool output
 * stays the source of truth inside the workspace transcript.
 */
export function WorkspaceChangesButton({
  hasRepoPath,
  busy,
  runAction,
}: WorkspaceChangesButtonProps) {
  return (
    <ActionButton
      type="button"
      tone="quiet"
      onClick={() => runAction({ type: "inspect_changes" })}
      disabled={!hasRepoPath || busy}
      className="w-full justify-between gap-2 px-1 py-1.5 text-left disabled:cursor-default disabled:opacity-70"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M7 7h10M7 12h10M7 17h7M5 4h14v16H5z" />
        </svg>
        <span className="min-w-0 truncate">Changes</span>
      </span>
    </ActionButton>
  );
}
