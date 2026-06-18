import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import {
  CHAT_HANDOFF_KEY,
  buildPrInsightChatHandoffDraft,
} from "../../checkpointHandoff.js";
import {
  fetchProjectLinkPullRequestInsightPreview,
  recordProjectLinkReviewHistory,
  recordProjectLinkReviewOperation,
  runProjectLinkReviewRun,
  saveProjectLinkPrInsightArtifact,
  type ProjectLink,
} from "../../api.js";
import {
  listPrInsightArtifacts,
  savePrInsightPreviewArtifact,
  savePrReviewRunArtifact,
  type PrInsightArtifact,
} from "../../prInsightArtifacts.js";
import { saveFindingsLocal } from "../../reviewHistoryLocal.js";
import {
  previewOperationDetails,
  reviewRunOperationDetails,
} from "./pullRequestViewModel.js";
import type { DisplayPullRequest, PreviewState, QueueState } from "./pullRequestTypes.js";

export interface UsePullRequestActionsInput {
  projectLinkId: string;
  projectLinks: ProjectLink[];
  selectedProjectLink: ProjectLink | null;
  projectLinkForPullRequest: (pr: DisplayPullRequest) => string;
  setQueueing: Dispatch<SetStateAction<Record<number, QueueState>>>;
  setPreviews: Dispatch<SetStateAction<Record<number, PreviewState>>>;
  setInsightArtifacts: Dispatch<SetStateAction<PrInsightArtifact[]>>;
}

export interface PullRequestActions {
  handleQueueForReview: (pr: DisplayPullRequest) => Promise<void>;
  handlePreviewInsight: (pr: DisplayPullRequest) => Promise<void>;
  openSavedInsightInChat: (pr: DisplayPullRequest, artifact: PrInsightArtifact) => void;
}

export function usePullRequestActions({
  projectLinkId,
  projectLinks,
  selectedProjectLink,
  projectLinkForPullRequest,
  setQueueing,
  setPreviews,
  setInsightArtifacts,
}: UsePullRequestActionsInput): PullRequestActions {
  const navigate = useNavigate();
  const refreshLocalArtifacts = useCallback(() => {
    setInsightArtifacts(projectLinkId ? listPrInsightArtifacts(projectLinkId) : listPrInsightArtifacts());
  }, [projectLinkId, setInsightArtifacts]);

  const handleQueueForReview = useCallback(async (pr: DisplayPullRequest) => {
    const actionProjectLinkId = projectLinkForPullRequest(pr);
    if (!actionProjectLinkId) return;

    setQueueing((prev) => ({ ...prev, [pr.id]: { phase: "watching" } }));
    try {
      await recordProjectLinkReviewHistory(actionProjectLinkId, {
        pullRequestId: pr.id,
        lastIterationId: 0,
        findingCount: 0,
        lastRunAt: new Date().toISOString(),
        sourceCommit: "",
        decisionQueue: "watching",
        decisionRiskLevel: "medium",
        decisionReason: `Preparing AI insight for ${pr.sourceBranch}`,
        decisionReasonCodes: [],
        contextConfidence: "",
        autoApprovedAt: "",
        autoApprovalActor: "",
        discardedFindingCount: 0,
        hunkCoverageFiles: 0,
        wholeFileFallbackFiles: 0,
        changedHunkLines: 0,
        manualDisposition: "",
        manualDispositionAt: "",
        manualDispositionActor: "",
        manualDispositionNote: "",
        manualDispositionEvents: [],
        manualDispositionWriteBackAttempted: false,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackAt: "",
        manualDispositionWriteBackThreadId: "",
        manualDispositionWriteBackUrl: "",
        manualDispositionWriteBackEvents: [],
      });
    } catch {
      // Non-fatal; the actual review can still run.
    }

    setQueueing((prev) => ({ ...prev, [pr.id]: { phase: "reviewing" } }));
    try {
      const result = await runProjectLinkReviewRun(actionProjectLinkId, pr.id, pr.targetBranch);
      await recordProjectLinkReviewHistory(actionProjectLinkId, {
        pullRequestId: result.pullRequestId,
        lastIterationId: result.iterationId,
        findingCount: result.findingCount,
        lastRunAt: result.lastRunAt,
        sourceCommit: "",
        decisionQueue: result.decisionQueue,
        decisionRiskLevel: result.decisionRiskLevel,
        decisionReason: result.decisionReason,
        decisionReasonCodes: result.decisionReasonCodes ?? [],
        contextConfidence: result.contextConfidence ?? "",
        autoApprovedAt: result.decisionQueue === "auto_approved" ? result.lastRunAt : "",
        autoApprovalActor: result.decisionQueue === "auto_approved" ? result.autoApprovalActor : "",
        discardedFindingCount: result.discardedFindings?.length ?? 0,
        hunkCoverageFiles: result.coverage?.filesWithHunks ?? 0,
        wholeFileFallbackFiles: result.coverage?.wholeFileOnlyFiles ?? 0,
        changedHunkLines: result.coverage?.changedHunkLines ?? 0,
        manualDisposition: "",
        manualDispositionAt: "",
        manualDispositionActor: "",
        manualDispositionNote: "",
        manualDispositionEvents: [],
        manualDispositionWriteBackAttempted: false,
        manualDispositionWriteBackOk: false,
        manualDispositionWriteBackError: "",
        manualDispositionWriteBackAt: "",
        manualDispositionWriteBackThreadId: "",
        manualDispositionWriteBackUrl: "",
        manualDispositionWriteBackEvents: [],
      });
      if (result.findings && result.findings.length > 0) {
        saveFindingsLocal(result.repository, result.pullRequestId, result.findings);
      }
      const artifact = savePrReviewRunArtifact({
        projectLinkId: actionProjectLinkId,
        repository: result.repository,
        pullRequestId: result.pullRequestId,
        title: pr.title,
        result,
      });
      refreshLocalArtifacts();
      void saveProjectLinkPrInsightArtifact(actionProjectLinkId, artifact);
      void recordProjectLinkReviewOperation(actionProjectLinkId, {
        kind: "review_run",
        repository: result.repository,
        pullRequestId: result.pullRequestId,
        label: `#${result.pullRequestId} · ${pr.title}`,
        ok: true,
        details: reviewRunOperationDetails(result),
      });
      setQueueing((prev) => ({ ...prev, [pr.id]: { phase: "done", result } }));
    } catch (err) {
      void recordProjectLinkReviewOperation(actionProjectLinkId, {
        kind: "review_run",
        repository: pr.repository,
        pullRequestId: pr.id,
        label: `#${pr.id} · ${pr.title}`,
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setQueueing((prev) => ({
        ...prev,
        [pr.id]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [projectLinkForPullRequest, refreshLocalArtifacts, setQueueing]);

  const handlePreviewInsight = useCallback(async (pr: DisplayPullRequest) => {
    const actionProjectLinkId = projectLinkForPullRequest(pr);
    if (!actionProjectLinkId) return;
    setPreviews((prev) => ({ ...prev, [pr.id]: { phase: "loading" } }));
    try {
      const result = await fetchProjectLinkPullRequestInsightPreview(actionProjectLinkId, pr.id);
      const artifact = savePrInsightPreviewArtifact({
        projectLinkId: actionProjectLinkId,
        repository: pr.repository,
        pullRequestId: pr.id,
        title: pr.title,
        result,
      });
      refreshLocalArtifacts();
      void saveProjectLinkPrInsightArtifact(actionProjectLinkId, artifact);
      void recordProjectLinkReviewOperation(actionProjectLinkId, {
        kind: "insight_preview",
        repository: pr.repository,
        pullRequestId: pr.id,
        label: `#${pr.id} · ${pr.title}`,
        ok: true,
        details: previewOperationDetails(result),
      });
      setPreviews((prev) => ({ ...prev, [pr.id]: { phase: "done", result } }));
    } catch (err) {
      void recordProjectLinkReviewOperation(actionProjectLinkId, {
        kind: "insight_preview",
        repository: pr.repository,
        pullRequestId: pr.id,
        label: `#${pr.id} · ${pr.title}`,
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setPreviews((prev) => ({
        ...prev,
        [pr.id]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [projectLinkForPullRequest, refreshLocalArtifacts, setPreviews]);

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
    handleQueueForReview,
    handlePreviewInsight,
    openSavedInsightInChat,
  };
}
