import { useEffect, useRef, useState } from "react";
import type { ProjectLink } from "../../../api.js";
import type { WorkflowEventState } from "../chat.types.js";
import type { GitStatusData } from "../toolOutputRenderers.js";
import {
  gitRecoveryPanelState,
  type WorkspaceAction,
} from "../workflowTaskState.js";
import { WorkspaceBranchMenu } from "./WorkspaceBranchMenu.js";
import { WorkspaceChangesButton } from "./WorkspaceChangesButton.js";
import { WorkspaceCommitMenu } from "./WorkspaceCommitMenu.js";
import { WorkspaceEnvironmentHeader } from "./WorkspaceEnvironmentHeader.js";
import { WorkspaceGitRecoveryPanel } from "./WorkspaceGitRecoveryPanel.js";
import { WorkspaceProjectLinkPanel } from "./WorkspaceProjectLinkPanel.js";
import { environmentHealth } from "./environmentHealth.js";
import { EnvironmentHealthSummary } from "./EnvironmentHealthSummary.js";
import type { DiffStats } from "./workspacePanel.types.js";

interface WorkspaceEnvironmentCardProps {
  repoPath: string;
  setRepoPath: (value: string) => void;
  currentBranch: string | null;
  branchList: string[];
  gitStatus: GitStatusData | null;
  diffStats: DiffStats | null;
  workflowState: WorkflowEventState | null;
  busy: boolean;
  projectLinks: ProjectLink[];
  activeProjectLinkId: string | null;
  setActiveProjectLinkId: (id: string | null) => void;
  onAction: (action: WorkspaceAction) => void;
}

export function WorkspaceEnvironmentCard({
  repoPath,
  setRepoPath,
  currentBranch,
  branchList,
  gitStatus,
  diffStats,
  workflowState,
  busy,
  projectLinks,
  activeProjectLinkId,
  setActiveProjectLinkId,
  onAction,
}: WorkspaceEnvironmentCardProps) {
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const [activeMenu, setActiveMenu] = useState<"branch" | "commit" | null>(null);
  const repoName = repoPath ? repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "" : "";
  const activeProjectLink = projectLinks.find((projectLink) => projectLink.id === activeProjectLinkId) ?? null;
  const adoReady = Boolean(activeProjectLink?.adoOrgUrl && activeProjectLink.adoProject && activeProjectLink.adoRepoName);
  const gitKnown = Boolean(gitStatus || diffStats);
  const branchName = currentBranch ?? activeProjectLink?.defaultBranch ?? "";
  const branchLabel = branchName || "not checked";
  const hasRepoPath = Boolean(repoPath.trim());
  const gitRecovery = gitRecoveryPanelState(workflowState);
  // MP-007: one typed health snapshot drives the summary line, reason and the
  // single primary action; the panels below stay secondary entry points.
  const health = environmentHealth({
    repoPath,
    busy,
    gitKnown,
    adoReady,
    projectLinkCount: projectLinks.length,
    blockedReason: workflowState?.status === "blocked" ? workflowState.currentStep : undefined,
  });

  const handleProjectLinkSelect = (id: string) => {
    setActiveProjectLinkId(id || null);
    const projectLink = projectLinks.find((item) => item.id === id);
    if (projectLink?.repoPath) setRepoPath(projectLink.repoPath);
  };

  const runAction = (action: WorkspaceAction) => {
    if (busy) return;
    setActiveMenu(null);
    onAction(action);
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
    document.addEventListener("mousedown", closeIfOutside, true);
    document.addEventListener("focusin", closeIfOutside, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside, true);
      document.removeEventListener("mousedown", closeIfOutside, true);
      document.removeEventListener("focusin", closeIfOutside, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [activeMenu]);

  return (
    <div
      onKeyDownCapture={(event) => {
        if (event.key === "Escape") setActiveMenu(null);
      }}
    >
      <EnvironmentHealthSummary
        health={health}
        onRecheck={() => {
          if (busy) return;
          runAction({ type: "inspect_environment" });
        }}
      />
      <WorkspaceEnvironmentHeader hasRepoPath={hasRepoPath} busy={busy} runAction={runAction} />
      <WorkspaceChangesButton
        hasRepoPath={hasRepoPath}
        busy={busy}
        runAction={runAction}
      />
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
        />
      </div>
      <WorkspaceGitRecoveryPanel gitRecovery={gitRecovery} busy={busy} runAction={runAction} />
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
        />
      </div>
    </div>
  );
}
