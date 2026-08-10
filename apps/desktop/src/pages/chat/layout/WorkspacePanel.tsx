import type { ProjectLink } from "../../../api.js";
import type {
  ConversationArtifactPart,
} from "../../../chatBubbles.js";
import { ArtifactWorkspaceShell } from "../artifacts/ArtifactWorkspace.js";
import { ContextSourcePanel } from "../artifacts/SourceWorkspace.js";
import type {
  ArtifactLookupState,
  WorkflowEventState,
} from "../chat.types.js";
import type { GitStatusData } from "../toolOutputRenderers.js";
import type {
  TaskState,
  WorkspaceAction,
} from "../workflowTaskState.js";
import { WorkspaceEnvironmentCard } from "./WorkspaceEnvironmentCard.js";
import { WorkspaceProgressPanel } from "./WorkspaceProgressPanel.js";
import type { DiffStats } from "./workspacePanel.types.js";

interface WorkspacePanelProps {
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
  selectedArtifact: ConversationArtifactPart | null;
  selectedArtifactLookupState: ArtifactLookupState | null;
  contextSources: string[];
  artifactCount: number;
  onClearArtifact: () => void;
  onAction: (action: WorkspaceAction) => void;
}

export function WorkspacePanel({
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
  selectedArtifact,
  selectedArtifactLookupState,
  contextSources,
  artifactCount,
  onClearArtifact,
  onAction,
}: WorkspacePanelProps) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-y-auto overscroll-contain bg-transparent px-3 py-4">
      <div className="relative min-w-0 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4 text-[rgb(var(--app-text))] shadow-sm">
        <WorkspaceEnvironmentCard
          repoPath={repoPath}
          setRepoPath={setRepoPath}
          currentBranch={currentBranch}
          branchList={branchList}
          gitStatus={gitStatus}
          diffStats={diffStats}
          workflowState={workflowState}
          busy={busy}
          projectLinks={projectLinks}
          activeProjectLinkId={activeProjectLinkId}
          setActiveProjectLinkId={setActiveProjectLinkId}
          onAction={onAction}
        />

        <ArtifactWorkspaceShell
          artifact={selectedArtifact}
          lookupState={selectedArtifactLookupState}
          artifactCount={artifactCount}
          onClear={onClearArtifact}
        />

        <WorkspaceProgressPanel
          taskState={taskState}
          workflowState={workflowState}
          busy={busy}
          onAction={onAction}
        />

        <ContextSourcePanel sources={contextSources} />
      </div>
    </div>
  );
}
