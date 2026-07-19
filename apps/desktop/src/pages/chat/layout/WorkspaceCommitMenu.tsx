import { useState } from "react";
import type { ProjectLink } from "../../../api.js";
import type { GitStatusData } from "../toolOutputRenderers.js";
import type { WorkspaceAction } from "../workflowTaskState.js";
import {
  gitDivergenceNotice,
  gitDivergenceNoticeClass,
} from "./gitDivergenceNotice.js";

interface WorkspaceCommitMenuProps {
  hasRepoPath: boolean;
  busy: boolean;
  branchName: string;
  branchLabel: string;
  hasChanges: boolean;
  added: number;
  removed: number;
  gitStatus: GitStatusData | null;
  activeProjectLink: ProjectLink | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runAction: (action: WorkspaceAction) => void;
}

export function WorkspaceCommitMenu({
  hasRepoPath,
  busy,
  branchName,
  branchLabel,
  hasChanges,
  added,
  removed,
  gitStatus,
  activeProjectLink,
  open,
  onOpenChange,
  runAction,
}: WorkspaceCommitMenuProps) {
  const [commitMessage, setCommitMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  const divergenceNotice = gitDivergenceNotice(gitStatus);
  const pushBlocked = Boolean(divergenceNotice?.blocksPush);

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
      targetBranch: activeProjectLink?.targetBranch || activeProjectLink?.defaultBranch || "main",
      title: message || undefined,
      draft: false,
    });
  };

  const syncBranchBeforePush = () => {
    runCommitAction({
      type: "sync_branch_rebase",
      branch: branchName || undefined,
    });
  };

  return (
    <div className="relative mt-1">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        disabled={!hasRepoPath || busy}
        className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition hover:bg-[rgb(var(--app-surface-raised))]"
      >
        <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 12h7m2 0h7M8 8l-4 4 4 4m8-8l4 4-4 4" />
        </svg>
        <span className="min-w-0 truncate">Commit or push</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-full rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-2xl">
          <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[rgb(var(--app-text-muted))]">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3v6a3 3 0 003 3h6M6 21v-7" />
              </svg>
              <span className="min-w-0 truncate">{branchLabel}</span>
            </span>
            {hasChanges && (
              <span className="shrink-0 whitespace-nowrap font-mono">
                <span className="text-[rgb(var(--app-success))]">+{added}</span>
                <span className="ml-1 text-[rgb(var(--app-danger))]">-{removed}</span>
              </span>
            )}
          </div>
          {divergenceNotice && (
            <div
              className={`mb-2 rounded-md border px-2 py-1.5 text-xs ${gitDivergenceNoticeClass(divergenceNotice.tone)}`}
              title="Remote readiness"
            >
              {divergenceNotice.label}
            </div>
          )}
          <textarea
            value={commitMessage}
            onChange={(event) => setCommitMessage(event.target.value)}
            rows={2}
            className="mb-3 w-full resize-none rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2.5 py-2 text-sm text-[rgb(var(--app-text))] outline-none placeholder:text-[rgb(var(--app-text-subtle))] focus:border-[rgb(var(--app-accent))]"
            placeholder="Commit message (leave blank to generate)..."
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
            {pushBlocked && (
              <button
                type="button"
                aria-label="Pull with rebase before pushing"
                onClick={syncBranchBeforePush}
                disabled={busy}
                className="flex w-full min-w-0 items-center gap-2 rounded-md bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-left text-sm transition hover:bg-[rgb(var(--app-accent-soft))] disabled:cursor-wait disabled:opacity-60"
              >
                <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 4v12m0 0 4-4m-4 4-4-4M5 20h14" />
                </svg>
                <span className="min-w-0 truncate">Pull/rebase first</span>
              </button>
            )}
            <button type="button" aria-label="Prepare commit" onClick={() => commitPrompt("commit")} disabled={busy} className="flex w-full min-w-0 items-center gap-2 rounded-md bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-left text-sm transition hover:bg-[rgb(var(--app-accent-soft))] disabled:cursor-wait disabled:opacity-60">
              <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 12h16M8 8l-4 4 4 4" />
              </svg>
              <span className="min-w-0 flex-1 truncate">Commit</span>
              <span className="shrink-0 rounded bg-[rgb(var(--app-border))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">Ctrl+↵</span>
            </button>
            <button
              type="button"
              aria-label="Prepare commit and push"
              onClick={() => commitPrompt("commit-push")}
              disabled={busy || pushBlocked}
              title={pushBlocked ? "Pull or rebase before pushing" : undefined}
              className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 16V4m0 0L8 8m4-4l4 4M5 20h14" />
              </svg>
              <span className="min-w-0 truncate">Commit and push</span>
            </button>
            <button
              type="button"
              aria-label="Push branch"
              onClick={() => commitPrompt("push")}
              disabled={busy || pushBlocked}
              title={pushBlocked ? "Pull or rebase before pushing" : undefined}
              className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-45"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 16V4m0 0L8 8m4-4l4 4M5 20h14" />
              </svg>
              <span className="min-w-0 truncate">Push</span>
            </button>
            <button type="button" onClick={createPullRequest} disabled={busy || !hasRepoPath} className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60">
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7h8m-8 5h5m-8 8h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="min-w-0 truncate">Create pull request</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
