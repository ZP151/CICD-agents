import { useEffect, useRef, useState } from "react";
import type { ProjectLink } from "../../../api.js";
import type { WorkflowEventState } from "../chat.types.js";
import type { GitStatusData } from "../toolOutputRenderers.js";
import {
  type TaskState,
  type WorkspaceAction,
  workflowStepActionState,
} from "../workflowTaskState.js";
import {
  gitDivergenceNotice,
  gitDivergenceNoticeClass,
} from "./gitDivergenceNotice.js";
import {
  workflowStepActionBadgeClass,
  workflowStepActionBadgeLabel,
  workflowStepActionClass,
  workflowStepActionDisabled,
  workflowStepActionTitle,
  workflowStepDotClass,
} from "./workflowStepPresentation.js";
import type { DiffStats } from "./workspacePanel.types.js";

interface PinnedSummaryPanelProps {
  repoPath: string;
  setRepoPath: (value: string) => void;
  currentBranch: string | null;
  branchList: string[];
  gitStatus: GitStatusData | null;
  diffStats: DiffStats | null;
  taskState: TaskState | null;
  workflowState: WorkflowEventState | null;
  busy: boolean;
  projectLinks: ProjectLink[];
  activeProjectLinkId: string | null;
  setActiveProjectLinkId: (id: string | null) => void;
  codePanelOpen: boolean;
  codePanelWidth: number;
  onAction: (action: WorkspaceAction) => void;
}

export function PinnedSummaryPanel({
  repoPath,
  setRepoPath,
  currentBranch,
  branchList,
  gitStatus,
  diffStats,
  taskState,
  workflowState,
  busy,
  projectLinks,
  activeProjectLinkId,
  setActiveProjectLinkId,
  codePanelOpen,
  codePanelWidth,
  onAction,
}: PinnedSummaryPanelProps) {
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const repoName = repoPath ? repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "" : "";
  const activeProjectLink = projectLinks.find((projectLink) => projectLink.id === activeProjectLinkId) ?? null;
  const [activeMenu, setActiveMenu] = useState<"branch" | "commit" | null>(null);
  const [progressOpen, setProgressOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  const branchName = currentBranch ?? activeProjectLink?.defaultBranch ?? "";
  const branchLabel = branchName || "not checked";
  const branchOptions = Array.from(new Set([branchName, ...branchList].filter(Boolean)));
  const changedFiles = gitStatus
    ? gitStatus.staged.length + gitStatus.modified.length + gitStatus.untracked.length + gitStatus.deleted.length
    : 0;
  const hasRepoPath = Boolean(repoPath.trim());
  const hasChanges = Boolean(diffStats ? diffStats.files > 0 : changedFiles > 0);
  const added = diffStats?.added ?? 0;
  const removed = diffStats?.removed ?? 0;
  const divergenceNotice = gitDivergenceNotice(gitStatus);
  const pushBlocked = Boolean(divergenceNotice?.blocksPush);

  const runAction = (action: WorkspaceAction) => {
    if (busy) return;
    setActiveMenu(null);
    onAction(action);
  };

  useEffect(() => {
    if (!activeMenu) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRootRef.current?.contains(target)) return;
      setActiveMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [activeMenu]);

  const handleProjectLinkSelect = (id: string) => {
    setActiveProjectLinkId(id || null);
    const projectLink = projectLinks.find((item) => item.id === id);
    if (projectLink?.repoPath) setRepoPath(projectLink.repoPath);
  };

  const commitPrompt = (mode: "commit" | "commit-push" | "push") => {
    const message = commitMessage.trim();
    if (mode === "push") {
      runAction({ type: "push_branch", branch: branchName || undefined });
      return;
    }
    runAction({
      type: mode === "commit-push" ? "commit_and_push" : "prepare_commit",
      branch: branchName || undefined,
      message: message || undefined,
      includeUnstaged,
    });
  };

  const syncBranchBeforePush = () => {
    runAction({ type: "sync_branch_rebase", branch: branchName || undefined });
  };

  return (
    <div
      className="pointer-events-none absolute top-12 z-20 hidden w-[300px] max-w-[calc(100%-24px)] lg:block"
      style={{ right: codePanelOpen ? codePanelWidth + 20 : 20 }}
    >
      <div className="pointer-events-auto rounded-2xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4 text-[rgb(var(--app-text))] shadow-lg">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-[rgb(var(--app-text-muted))]">Environment</p>
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-[rgb(var(--app-text-muted))]">
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 19h16M7 16V7h10v9M9 16V9h6v7" />
          </svg>
          <span className="min-w-0 truncate" title={repoPath}>{repoName || "Local"}</span>
        </div>

        <div ref={menuRootRef}>
          <div className="relative mt-1">
            <button
              type="button"
              onClick={() => setActiveMenu((value) => value === "branch" ? null : "branch")}
              disabled={!hasRepoPath || busy}
              className="flex w-full items-center gap-2 rounded-md bg-[rgb(var(--app-surface-raised))] px-1.5 py-1.5 text-sm transition hover:bg-[rgb(var(--app-accent-soft))] disabled:cursor-default disabled:opacity-60"
            >
              <svg className="h-4 w-4 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 3v6a3 3 0 003 3h6m0 0l-2-2m2 2l-2 2M6 21v-7m0 0a3 3 0 100-6 3 3 0 000 6zm12 7v-7m0 0a3 3 0 100-6 3 3 0 000 6z" />
              </svg>
              <span className="min-w-0 flex-1 truncate text-left font-mono">{branchLabel}</span>
              <svg className="h-3.5 w-3.5 text-[rgb(var(--app-text-subtle))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {activeMenu === "branch" && (
              <div className="absolute right-full top-0 z-30 mr-2 w-72 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-2xl">
                <button
                  type="button"
                  onClick={() => runAction({ type: "refresh_branch" })}
                  disabled={busy}
                  className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="text-base leading-none">↻</span>
                  Refresh branch state
                </button>
                <button
                  type="button"
                  onClick={() => runAction({ type: "fetch_remotes" })}
                  disabled={busy}
                  className="mb-2 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-wait disabled:opacity-60"
                >
                  <span className="text-base leading-none">↓</span>
                  Fetch remotes
                </button>
                <p className="mb-2 text-xs text-[rgb(var(--app-text-muted))]">Branches</p>
                <div className="max-h-52 space-y-1 overflow-y-auto">
                  {branchOptions.map((branch) => (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => runAction({ type: "checkout_branch", branch })}
                      disabled={busy}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-[rgb(var(--app-surface-raised))]"
                    >
                      <span className="text-[rgb(var(--app-text-muted))]">⑂</span>
                      <span className="min-w-0 flex-1 truncate font-mono">{branch}</span>
                      {branch === branchName && <span className="text-[rgb(var(--app-text-muted))]">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="relative mt-1">
            <button
              type="button"
              onClick={() => setActiveMenu((value) => value === "commit" ? null : "commit")}
              disabled={!hasRepoPath || busy}
              className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm transition hover:bg-[rgb(var(--app-surface-raised))] disabled:cursor-default disabled:opacity-60"
            >
              <svg className="h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 12h7m2 0h7M8 8l-4 4 4 4m8-8l4 4-4 4" />
              </svg>
              <span className="min-w-0 truncate">Commit or push</span>
            </button>
            {activeMenu === "commit" && (
              <div className="absolute right-full top-0 z-30 mr-2 w-80 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-2xl">
                <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate font-mono text-[rgb(var(--app-text-muted))]">{branchLabel}</span>
                  {hasChanges && (
                    <span className="shrink-0 whitespace-nowrap font-mono">
                      <span className="text-emerald-500">+{added}</span>
                      <span className="ml-1 text-red-500">-{removed}</span>
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
                      <span>↓</span>
                      <span className="min-w-0 truncate">Pull/rebase first</span>
                    </button>
                  )}
                  <button type="button" aria-label="Prepare commit" onClick={() => commitPrompt("commit")} disabled={busy} className="flex w-full min-w-0 items-center gap-2 rounded-md bg-[rgb(var(--app-surface-raised))] px-2 py-1.5 text-left text-sm transition hover:bg-[rgb(var(--app-accent-soft))] disabled:cursor-wait disabled:opacity-60">
                    <span>←</span>
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
                    <span>↑</span>
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
                    <span>↑</span>
                    <span className="min-w-0 truncate">Push</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className="mt-3 border-t border-[rgb(var(--app-border))] pt-2"
          onClickCapture={() => setActiveMenu(null)}
          onFocusCapture={() => setActiveMenu(null)}
          onPointerDownCapture={() => setActiveMenu(null)}
        >
          {projectLinks.length > 0 ? (
            <select
              className="w-full bg-transparent text-xs text-[rgb(var(--app-text-muted))] outline-none"
              value={activeProjectLinkId ?? ""}
              onChange={(event) => handleProjectLinkSelect(event.target.value)}
              title="Project Link"
            >
              <option value="">No Project Link</option>
              {projectLinks.map((projectLink) => (
                <option key={projectLink.id} value={projectLink.id}>{projectLink.name}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-[rgb(var(--app-text-subtle))]">No Project Link</p>
          )}
          {activeProjectLink && (
            <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-subtle))]">
              {[activeProjectLink.adoProject, activeProjectLink.adoRepoName].filter(Boolean).join(" / ")}
            </p>
          )}
        </div>

        <div className="mt-3 border-t border-[rgb(var(--app-border))] pt-2">
          <button
            type="button"
            onClick={() => setProgressOpen((value) => !value)}
            className="flex w-full items-center justify-between rounded-md py-1 text-sm text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))]"
          >
            <span>Progress</span>
            <span className="text-[rgb(var(--app-text-subtle))]">{progressOpen ? "⌄" : "›"}</span>
          </button>
          {progressOpen && (
            <div className="mt-2 space-y-2">
              {taskState ? (
                taskState.steps.map((step, index) => {
                  const actionState = workflowStepActionState(step, { busy, workflowStatus: workflowState?.status });
                  return (
                    <div key={index} className="flex items-start gap-2 text-xs text-[rgb(var(--app-text-muted))]">
                      <span className={workflowStepDotClass(step, actionState)} />
                      {step.action ? (
                        <button
                          type="button"
                          onClick={() => runAction(step.action!)}
                          disabled={workflowStepActionDisabled(actionState)}
                          className={workflowStepActionClass(step, actionState)}
                          data-workflow-step-state={actionState}
                          title={workflowStepActionTitle(step, actionState, workflowState)}
                        >
                          <span className="min-w-0 truncate">{step.label}</span>
                          {actionState !== "idle" && (
                            <span className={workflowStepActionBadgeClass(actionState)}>
                              {workflowStepActionBadgeLabel(actionState)}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className={step.done ? "min-w-0 line-through opacity-70" : "min-w-0"}>{step.label}</span>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
                  Ask MergePilot to inspect changes, review PR insight, or prepare a commit.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
