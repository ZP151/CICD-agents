import { useId, useState } from "react";
import type { ProjectLink } from "../../../api.js";
import type { WorkspaceAction } from "../workflowTaskState.js";
import {
  ActionButton,
  WorkbenchTextArea,
} from "../../../components/workbench/WorkbenchPrimitives.js";

interface WorkspaceCommitMenuProps {
  hasRepoPath: boolean;
  busy: boolean;
  branchName: string;
  branchLabel: string;
  activeProjectLink: ProjectLink | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runAction: (action: WorkspaceAction) => void;
  /** Lets the compact pinned summary open away from the window edge. */
  menuPositionClassName?: string;
}

export function WorkspaceCommitMenu({
  hasRepoPath,
  busy,
  branchName,
  branchLabel,
  activeProjectLink,
  open,
  onOpenChange,
  runAction,
  menuPositionClassName = "right-0 top-full mt-1 w-full",
}: WorkspaceCommitMenuProps) {
  const commitMenuId = useId();
  const [commitMessage, setCommitMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);

  const runCommitAction = (action: WorkspaceAction) => {
    onOpenChange(false);
    runAction(action);
  };

  const commitPrompt = (mode: "commit" | "commit-push" | "push") => {
    const message = commitMessage.trim();
    if (mode === "push") {
      runCommitAction({
        type: "push_branch",
        branch: branchName || undefined,
      });
      return;
    }
    runCommitAction({
      type: mode === "commit-push" ? "commit_and_push" : "prepare_commit",
      branch: branchName || undefined,
      message: message || undefined,
      includeUnstaged,
    });
  };

  const createPullRequest = () => {
    const message = commitMessage.trim();
    runCommitAction({
      type: "create_pr",
      branch: branchName || undefined,
      targetBranch: activeProjectLink?.targetBranch || undefined,
      title: message || undefined,
      draft: false,
    });
  };

  return (
    <div className="relative mt-1">
      <ActionButton
        type="button"
        tone="quiet"
        onClick={() => onOpenChange(!open)}
        disabled={!hasRepoPath || busy}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? commitMenuId : undefined}
        className="w-full !justify-start !gap-3 !px-0 py-1.5 text-sm"
      >
        <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 12h7m2 0h7M8 8l-4 4 4 4m8-8l4 4-4 4" />
        </svg>
        <span className="min-w-0 truncate">Commit or push</span>
      </ActionButton>
      {open && (
        <div id={commitMenuId} role="dialog" aria-label="Commit and push actions" className={`absolute z-30 ${menuPositionClassName} rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-sm`}>
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[rgb(var(--app-text-muted))]">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3v6a3 3 0 003 3h6M6 21v-7" />
              </svg>
              <span className="min-w-0 truncate">{branchLabel}</span>
            </span>
          </div>
          <WorkbenchTextArea
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            rows={2}
            className="mb-3 resize-none text-sm"
            placeholder="Commit message (leave blank to generate)..."
            aria-label="Commit message"
          />
          <label className="mb-2 flex items-center gap-2 text-sm text-[rgb(var(--app-text-muted))]">
            <input
              type="checkbox"
              checked={includeUnstaged}
              onChange={(event) => setIncludeUnstaged(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-[rgb(var(--app-border))]"
            />
            Include unstaged changes
          </label>
          <div className="space-y-1 border-t border-[rgb(var(--app-border))] pt-2">
            <ActionButton type="button" tone="secondary" aria-label="Prepare commit" onClick={() => commitPrompt("commit")} disabled={busy} className="w-full !justify-start !gap-2 !px-2 py-1.5 text-left text-sm disabled:cursor-wait">
              <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 12h16M8 8l-4 4 4 4" />
              </svg>
              <span className="min-w-0 flex-1 truncate">Commit</span>
              <span className="shrink-0 rounded bg-[rgb(var(--app-border))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">Ctrl+↵</span>
            </ActionButton>
            <ActionButton
              type="button"
              tone="quiet"
              aria-label="Prepare commit and push"
              onClick={() => commitPrompt("commit-push")}
              disabled={busy}
              className="w-full !justify-start !gap-2 !px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 16V4m0 0L8 8m4-4l4 4M5 20h14" />
              </svg>
              <span className="min-w-0 truncate">Commit and push</span>
            </ActionButton>
            <ActionButton
              type="button"
              tone="quiet"
              aria-label="Push branch"
              onClick={() => commitPrompt("push")}
              disabled={busy}
              className="w-full !justify-start !gap-2 !px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed disabled:opacity-45"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 16V4m0 0L8 8m4-4l4 4M5 20h14" />
              </svg>
              <span className="min-w-0 truncate">Push</span>
            </ActionButton>
            <ActionButton type="button" tone="quiet" onClick={createPullRequest} disabled={busy || !hasRepoPath} className="w-full !justify-start !gap-2 !px-2 py-1.5 text-left text-sm disabled:cursor-wait">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7h8m-8 5h5m-8 8h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="min-w-0 truncate">Create pull request</span>
            </ActionButton>
          </div>
        </div>
      )}
    </div>
  );
}
