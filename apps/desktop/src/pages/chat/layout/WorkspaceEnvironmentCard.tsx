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
  statusText: string | null;
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
  statusText,
  onAction,
}: WorkspaceEnvironmentCardProps) {
  const repoName = repoPath ? repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? "" : "";
  const activeProjectLink = projectLinks.find((projectLink) => projectLink.id === activeProjectLinkId) ?? null;
  const adoReady = Boolean(activeProjectLink?.adoOrgUrl && activeProjectLink.adoProject && activeProjectLink.adoRepoName);
  const gitKnown = Boolean(gitStatus || diffStats);
  const branchName = currentBranch ?? activeProjectLink?.defaultBranch ?? "";
  const branchLabel = branchName || "not checked";
  const changedFiles = gitStatus
    ? gitStatus.staged.length + gitStatus.modified.length + gitStatus.untracked.length + gitStatus.deleted.length
    : 0;
  const hasRepoPath = Boolean(repoPath.trim());
  const hasChanges = Boolean(diffStats ? diffStats.files > 0 : changedFiles > 0);
  const added = diffStats?.added ?? 0;
  const removed = diffStats?.removed ?? 0;
  const gitRecovery = gitRecoveryPanelState(workflowState);

  const handleProjectLinkSelect = (id: string) => {
    setActiveProjectLinkId(id || null);
    const projectLink = projectLinks.find((item) => item.id === id);
    if (projectLink?.repoPath) setRepoPath(projectLink.repoPath);
  };

  const runAction = (action: WorkspaceAction) => {
    if (busy) return;
    onAction(action);
  };

  return (
    <>
      <WorkspaceEnvironmentHeader hasRepoPath={hasRepoPath} busy={busy} runAction={runAction} />
      <WorkspaceChangesButton
        hasRepoPath={hasRepoPath}
        busy={busy}
        statusText={statusText}
        gitKnown={gitKnown}
        hasChanges={hasChanges}
        added={added}
        removed={removed}
        runAction={runAction}
      />
      <WorkspaceBranchMenu
        hasRepoPath={hasRepoPath}
        busy={busy}
        branchName={branchName}
        branchLabel={branchLabel}
        branchList={branchList}
        runAction={runAction}
      />
      <WorkspaceCommitMenu
        hasRepoPath={hasRepoPath}
        busy={busy}
        branchName={branchName}
        branchLabel={branchLabel}
        hasChanges={hasChanges}
        added={added}
        removed={removed}
        activeProjectLink={activeProjectLink}
        runAction={runAction}
      />
      <WorkspaceGitRecoveryPanel gitRecovery={gitRecovery} busy={busy} runAction={runAction} />
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
    </>
  );
}
