import { useEffect, useRef, useState } from "react";
import { WorkbenchDisclosure } from "../../../components/workbench/WorkbenchPrimitives.js";
import type { ProjectLink } from "../../../api.js";
import type { WorkflowEventState } from "../chat.types.js";
import type { GitStatusData } from "../toolOutputRenderers.js";
import type { TaskState, WorkspaceAction } from "../workflowTaskState.js";
import { WorkspaceBranchMenu } from "./WorkspaceBranchMenu.js";
import { WorkspaceCommitMenu } from "./WorkspaceCommitMenu.js";
import { WorkspaceProjectLinkPanel } from "./WorkspaceProjectLinkPanel.js";
import { WorkflowProgressList } from "./WorkflowProgressList.js";
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

/**
 * A compact, pinned counterpart to the workspace panel. It deliberately
 * composes the same branch, commit, project and progress primitives instead
 * of maintaining a second action surface with subtly different behaviour.
 */
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
  const [activeMenu, setActiveMenu] = useState<"branch" | "commit" | null>(null);
  const repoName = repoPath ? repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "" : "";
  const activeProjectLink = projectLinks.find((projectLink) => projectLink.id === activeProjectLinkId) ?? null;
  const branchName = currentBranch ?? activeProjectLink?.defaultBranch ?? "";
  const branchLabel = branchName || "not checked";
  const changedFiles = gitStatus
    ? gitStatus.staged.length + gitStatus.modified.length + gitStatus.untracked.length + gitStatus.deleted.length
    : 0;
  const hasRepoPath = Boolean(repoPath.trim());
  const hasChanges = Boolean(diffStats ? diffStats.files > 0 : changedFiles > 0);
  const added = diffStats?.added ?? 0;
  const removed = diffStats?.removed ?? 0;
  const adoReady = Boolean(activeProjectLink?.adoOrgUrl && activeProjectLink.adoProject && activeProjectLink.adoRepoName);

  const runAction = (action: WorkspaceAction) => {
    if (busy) return;
    setActiveMenu(null);
    onAction(withDefaultBranch(action, branchName));
  };

  const handleProjectLinkSelect = (id: string) => {
    setActiveProjectLinkId(id || null);
    const projectLink = projectLinks.find((item) => item.id === id);
    if (projectLink?.repoPath) setRepoPath(projectLink.repoPath);
  };

  useEffect(() => {
    if (!activeMenu) return;
    const closeIfOutside = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRootRef.current?.contains(target)) return;
      setActiveMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveMenu(null);
    };
    document.addEventListener("pointerdown", closeIfOutside, true);
    document.addEventListener("focusin", closeIfOutside, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      document.removeEventListener("focusin", closeIfOutside, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [activeMenu]);

  return (
    <aside
      className={pinnedSummaryPanelShellClass()}
      style={{ right: codePanelOpen ? codePanelWidth + 20 : 20 }}
      aria-label="Workspace summary"
    >
      <div className="pointer-events-auto rounded-2xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4 text-[rgb(var(--app-text))] shadow-lg">
        <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm text-[rgb(var(--app-text-muted))]">Environment</p>
        </div>

        <div className="mt-1 flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-sm text-[rgb(var(--app-text-muted))]">
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 19h16M7 16V7h10v9M9 16V9h6v7" />
          </svg>
          <span className="min-w-0 truncate">{repoName || "Local"}</span>
        </div>

        <div ref={menuRootRef}>
          <WorkspaceBranchMenu
            hasRepoPath={hasRepoPath}
            busy={busy}
            branchName={branchName}
            branchLabel={branchLabel}
            branchList={branchList}
            open={activeMenu === "branch"}
            onOpenChange={(open) => setActiveMenu(open ? "branch" : null)}
            runAction={runAction}
            menuPositionClassName="right-full top-0 mr-2 w-72"
          />
          <WorkspaceCommitMenu
            hasRepoPath={hasRepoPath}
            busy={busy}
            branchName={branchName}
            branchLabel={branchLabel}
            hasChanges={hasChanges}
            added={added}
            removed={removed}
            gitStatus={gitStatus}
            activeProjectLink={activeProjectLink}
            open={activeMenu === "commit"}
            onOpenChange={(open) => setActiveMenu(open ? "commit" : null)}
            runAction={runAction}
            menuPositionClassName="right-full top-0 mr-2 w-80"
          />
        </div>

        <div
          onClickCapture={() => setActiveMenu(null)}
          onFocusCapture={() => setActiveMenu(null)}
          onPointerDownCapture={() => setActiveMenu(null)}
        >
          <WorkspaceProjectLinkPanel
            repoName={repoName}
            repoPath={repoPath}
            projectLinks={projectLinks}
            activeProjectLink={activeProjectLink}
            activeProjectLinkId={activeProjectLinkId}
            adoReady={adoReady}
            branchName={branchName}
            busy={busy}
            onProjectLinkSelect={handleProjectLinkSelect}
            runAction={runAction}
            showRepositoryContext={false}
            actionDensity="compact"
          />
        </div>

        <WorkbenchDisclosure label="Progress" className="mt-3 border-t border-[rgb(var(--app-border))] pt-2">
          <div className="mt-2">
            <WorkflowProgressList
              taskState={taskState}
              workflowState={workflowState}
              busy={busy}
              onAction={runAction}
              compact
              showDetails={false}
            />
          </div>
        </WorkbenchDisclosure>
      </div>
    </aside>
  );
}

export function pinnedSummaryPanelShellClass(): string {
  return "pointer-events-none absolute top-12 z-40 hidden w-[min(20rem,calc(100vw-2rem))] max-w-[calc(100%-24px)] lg:block";
}

function withDefaultBranch(action: WorkspaceAction, branchName: string): WorkspaceAction {
  if (!branchName) return action;
  switch (action.type) {
    case "prepare_commit":
    case "commit_and_push":
    case "push_branch":
    case "sync_branch_rebase":
    case "trigger_pipeline":
      return action.branch ? action : { ...action, branch: branchName };
    default:
      return action;
  }
}
