import { useState } from "react";
import type { WorkspaceAction } from "../workflowTaskState.js";
import {
  ActionButton,
  WorkbenchTextInput,
} from "../../../components/workbench/WorkbenchPrimitives.js";

interface WorkspaceBranchMenuProps {
  hasRepoPath: boolean;
  busy: boolean;
  branchName: string;
  branchLabel: string;
  branchList: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runAction: (action: WorkspaceAction) => void;
  /** Lets the compact pinned summary open away from the window edge. */
  menuPositionClassName?: string;
}

export function WorkspaceBranchMenu({
  hasRepoPath,
  busy,
  branchName,
  branchLabel,
  branchList,
  open,
  onOpenChange,
  runAction,
  menuPositionClassName = "right-0 top-full mt-1 w-full",
}: WorkspaceBranchMenuProps) {
  const [newBranchName, setNewBranchName] = useState("");
  const branchOptions = Array.from(new Set([branchName, ...branchList].filter(Boolean)));

  const runBranchAction = (action: WorkspaceAction) => {
    onOpenChange(false);
    runAction(action);
  };

  const createBranch = () => {
    const name = newBranchName.trim();
    if (!name) return;
    runBranchAction({ type: "create_branch", branch: name });
  };

  return (
    <div className="relative mt-1">
      <ActionButton
        type="button"
        tone="quiet"
        onClick={() => onOpenChange(!open)}
        disabled={!hasRepoPath || busy}
        aria-expanded={open}
        className="w-full justify-start gap-2 bg-[rgb(var(--app-surface-raised))] px-1.5 py-1.5 text-sm hover:bg-[rgb(var(--app-accent-soft))]"
      >
        <svg className="h-4 w-4 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3v6a3 3 0 003 3h6m0 0l-2-2m2 2l-2 2M6 21v-7m0 0a3 3 0 100-6 3 3 0 000 6zm12 7v-7m0 0a3 3 0 100-6 3 3 0 000 6z" />
        </svg>
        <span className="min-w-0 flex-1 truncate text-left font-mono">{branchLabel}</span>
        <svg className="h-3.5 w-3.5 text-[rgb(var(--app-text-subtle))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 9l6 6 6-6" />
        </svg>
      </ActionButton>
      {open && (
        <div className={`absolute z-30 ${menuPositionClassName} rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-2xl`}>
          <div className="mb-3 flex items-center gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-xs text-[rgb(var(--app-text-muted))]">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M21 21l-4.3-4.3m1.8-5.2a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Search branches
          </div>
          <ActionButton
            type="button"
            tone="quiet"
            onClick={() => runBranchAction({ type: "refresh_branch" })}
            disabled={busy}
            className="mb-2 w-full justify-start gap-2 px-2 py-2 text-left text-sm disabled:cursor-wait"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 4v6h6M20 20v-6h-6M5 15a7 7 0 0011.9 3M19 9A7 7 0 007.1 6" />
            </svg>
            Refresh branch state
          </ActionButton>
          <ActionButton
            type="button"
            tone="quiet"
            onClick={() => runBranchAction({ type: "fetch_remotes" })}
            disabled={busy}
            className="mb-2 w-full justify-start gap-2 px-2 py-2 text-left text-sm disabled:cursor-wait"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 3v12m0 0l-4-4m4 4l4-4M5 19h14" />
            </svg>
            Fetch remotes
          </ActionButton>
          <p className="mb-2 text-xs text-[rgb(var(--app-text-muted))]">Branches</p>
          <div className="space-y-1">
            {branchOptions.map((branch) => (
              <ActionButton
                key={branch}
                type="button"
                tone="quiet"
                onClick={() => runBranchAction({ type: "checkout_branch", branch })}
                disabled={busy}
                aria-current={branch === branchName ? "true" : undefined}
                className="w-full justify-start gap-2 px-2 py-2 text-left text-sm"
              >
                <svg className="h-4 w-4 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3v6a3 3 0 003 3h6M6 21v-7m0 0a3 3 0 100-6 3 3 0 000 6zm12 7v-7" />
                </svg>
                <span className="min-w-0 flex-1 truncate font-mono">{branch}</span>
                {branch === branchName && <span className="text-[rgb(var(--app-text-muted))]">✓</span>}
              </ActionButton>
            ))}
          </div>
          <div className="mt-3 border-t border-[rgb(var(--app-border))] pt-2">
            <WorkbenchTextInput
              value={newBranchName}
              onChange={(event) => setNewBranchName(event.target.value)}
              className="mb-2 px-2 py-1.5 text-sm"
              placeholder="new branch name"
              aria-label="New branch name"
            />
            <ActionButton
              type="button"
              tone="quiet"
              onClick={createBranch}
              disabled={!newBranchName.trim() || busy}
              className="w-full justify-start gap-2 px-2 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="text-lg leading-none">+</span>
              Create and checkout new branch...
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
