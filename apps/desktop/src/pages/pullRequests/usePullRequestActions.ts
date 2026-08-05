import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import {
  CHAT_HANDOFF_KEY,
  buildPrInsightChatHandoffDraft,
} from "../../checkpointHandoff.js";
import {
  fetchProjectLinkPullRequestInsightPreview,
  saveProjectLinkPrInsightArtifact,
  type ProjectLink,
} from "../../api.js";
import {
  savePrInsightPreviewArtifact,
  type PrInsightArtifact,
} from "../../prInsightArtifacts.js";
import { previewOperationDetails } from "./pullRequestViewModel.js";
import {
  pullRequestRuntimeKey,
  type DisplayPullRequest,
  type PreviewState,
} from "./pullRequestTypes.js";

export interface UsePullRequestActionsInput {
  projectLinkId: string;
  projectLinks: ProjectLink[];
  selectedProjectLink: ProjectLink | null;
  projectLinkForPullRequest: (pr: DisplayPullRequest) => string;
  setPreviews: Dispatch<SetStateAction<Record<string, PreviewState>>>;
  onInsightArtifactSaved: (artifact: PrInsightArtifact, projectLinkId: string) => void;
}

export interface PullRequestActions {
  handlePreviewInsight: (pr: DisplayPullRequest) => Promise<void>;
  openSavedInsightInChat: (pr: DisplayPullRequest, artifact: PrInsightArtifact) => void;
}

export function usePullRequestActions({
  projectLinkId,
  projectLinks,
  selectedProjectLink,
  projectLinkForPullRequest,
  setPreviews,
  onInsightArtifactSaved,
}: UsePullRequestActionsInput): PullRequestActions {
  const navigate = useNavigate();

  const handlePreviewInsight = useCallback(async (pr: DisplayPullRequest) => {
    const actionProjectLinkId = projectLinkForPullRequest(pr);
    if (!actionProjectLinkId) return;
    const prKey = pullRequestRuntimeKey(pr);
    setPreviews((prev) => ({ ...prev, [prKey]: { phase: "loading" } }));
    try {
      const result = await fetchProjectLinkPullRequestInsightPreview(actionProjectLinkId, pr.id);
      const artifact = savePrInsightPreviewArtifact({
        projectLinkId: actionProjectLinkId,
        repository: pr.repository,
        pullRequestId: pr.id,
        title: pr.title,
        result,
      });
      onInsightArtifactSaved(artifact, actionProjectLinkId);
      void saveProjectLinkPrInsightArtifact(actionProjectLinkId, artifact).finally(() => {
        onInsightArtifactSaved(artifact, actionProjectLinkId);
      });
      setPreviews((prev) => ({ ...prev, [prKey]: { phase: "done", result } }));
    } catch (err) {
      setPreviews((prev) => ({
        ...prev,
        [prKey]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [onInsightArtifactSaved, projectLinkForPullRequest, setPreviews]);

  const openSavedInsightInChat = useCallback((pr: DisplayPullRequest, artifact: PrInsightArtifact) => {
    const actionProjectLinkId = projectLinkForPullRequest(pr);
    const actionProjectLink = projectLinks.find((projectLink) => projectLink.id === actionProjectLinkId) ?? selectedProjectLink;
    const draft = buildPrInsightChatHandoffDraft({
      pullRequestId: pr.id,
      title: pr.title,
      repository: pr.repository,
      repoPath: actionProjectLink?.repoPath || ".",
      projectLinkId: actionProjectLinkId,
      kind: artifact.kind,
      artifactId: artifact.id,
    });
    sessionStorage.setItem(CHAT_HANDOFF_KEY, JSON.stringify(draft));
    navigate("/chat");
  }, [navigate, projectLinkForPullRequest, projectLinks, selectedProjectLink]);

  return {
    handlePreviewInsight,
    openSavedInsightInChat,
  };
}
