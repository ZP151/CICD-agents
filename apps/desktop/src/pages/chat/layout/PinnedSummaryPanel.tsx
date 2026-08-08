import { useEffect, useRef, useState } from "react";
import { WorkbenchDisclosure } from "../../../components/workbench/WorkbenchPrimitives.js";
import type { ProjectLink } from "../../../api.js";
import type { WorkflowEventState } from "../chat.types.js";
import type { TaskState, WorkspaceAction } from "../workflowTaskState.js";
import { gitRecoveryPanelState } from "../workflowTaskState.js";
import { WorkspaceBranchMenu } from "./WorkspaceBranchMenu.js";
import { WorkspaceCommitMenu } from "./WorkspaceCommitMenu.js";
import { WorkspaceGitRecoveryPanel } from "./WorkspaceGitRecoveryPanel.js";
import { WorkflowProgressList } from "./WorkflowProgressList.js";

interface PinnedSummaryPanelProps {
  repoPath: string;
  setRepoPath: (value: string) => void;
  currentBranch: string | null;
  branchList: string[];
  taskState: TaskState | null;
  workflowState: WorkflowEventState | null;
  busy: boolean;
  projectLinks: ProjectLink[];
  activeProjectLinkId: string | null;
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
  taskState,
  workflowState,
  busy,
  projectLinks,
  activeProjectLinkId,
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
  const hasRepoPath = Boolean(repoPath.trim());
  const gitRecovery = gitRecoveryPanelState(workflowState);

  const runAction = (action: WorkspaceAction) => {
    if (busy) return;
    setActiveMenu(null);
    onAction(withDefaultBranch(action, branchName));
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
          <p className="min-w-0 truncate text-sm text-[rgb(var(--app-text-muted))]">Context</p>
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
            activeProjectLink={activeProjectLink}
            open={activeMenu === "commit"}
            onOpenChange={(open) => setActiveMenu(open ? "commit" : null)}
            runAction={runAction}
            menuPositionClassName="right-full top-0 mr-2 w-80"
          />
        </div>

        <div className="mt-2">
          <WorkspaceGitRecoveryPanel gitRecovery={gitRecovery} busy={busy} runAction={runAction} />
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
