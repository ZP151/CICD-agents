import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../App.js";
import {
  CHAT_HANDOFF_KEY,
  PULL_REQUESTS_HANDOFF_KEY,
  buildCheckpointRollbackHandoffDraft,
  buildPullRequestsPrHandoffDraft,
  buildPrInsightChatHandoffDraft,
} from "../checkpointHandoff.js";
import { prInsightArtifactProjectLinkId } from "../prInsightArtifacts.js";
import { ActivitySidebar } from "./taskViewer/ActivitySidebar.js";
import { CheckpointDetailPanel } from "./taskViewer/CheckpointDetailPanel.js";
import { PrInsightDetailPanel } from "./taskViewer/PrInsightDetailPanel.js";
import { ReviewOperationDetailPanel } from "./taskViewer/ReviewOperationDetailPanel.js";
import { TaskRunDetailPanel } from "./taskViewer/TaskRunDetailPanel.js";
import type { PrInsightActivityItem } from "./taskViewer/prInsightActivity.js";
import { useTaskViewerRuntime } from "./taskViewer/useTaskViewerRuntime.js";

export { PrInsightReadinessBlockers } from "./taskViewer/PrInsightReadinessBlockers.js";

export default function TaskViewer(): JSX.Element {
  const navigate = useNavigate();
  const { projectLinks } = useAppData();
  const [copiedPrInsightId, setCopiedPrInsightId] = useState<string | null>(null);
  const runtime = useTaskViewerRuntime(projectLinks);
  const {
    tasks,
    selected,
    selectedId,
    selectedReview,
    selectedPrInsight,
    selectedCheckpoint,
    loading,
    activeCount,
    error,
    checkpointActivity,
    checkpointLoading,
    checkpointPreview,
    checkpointPreviewLoading,
    checkpointRollbackPlan,
    checkpointRollbackLoading,
    filteredPrInsightActivity,
    prInsightLoading,
    prInsightProjectLinkFilter,
    prInsightKindFilter,
    prInsightHistoryMeta,
    selectedPrInsightComparison,
    selectedPrInsightRefreshComparison,
    selectedPrInsightId,
    filteredReviewActivity,
    reviewLoading,
    reviewProjectLinkFilter,
    reviewKindFilter,
    selectedReviewId,
    selectedCheckpointId,
    refreshAll,
    selectTask,
    selectCheckpointActivity,
    selectPrInsightActivity,
    selectReviewActivity,
    setPrInsightProjectLinkFilter,
    setPrInsightKindFilter,
    setReviewProjectLinkFilter,
    setReviewKindFilter,
  } = runtime;

  function openRollbackPlanInChat(): void {
    if (!selectedCheckpoint || !checkpointRollbackPlan?.proposal) return;
    sessionStorage.setItem(
      CHAT_HANDOFF_KEY,
      JSON.stringify(
        buildCheckpointRollbackHandoffDraft({
          proposal: checkpointRollbackPlan.proposal,
          checkpointId: selectedCheckpoint.checkpointId,
          repoPath: selectedCheckpoint.repoPath,
          projectLinkId: selectedCheckpoint.projectLinkId,
        }),
      ),
    );
    navigate("/chat");
  }

  function openPrInsightInChat(item: PrInsightActivityItem): void {
    sessionStorage.setItem(
      CHAT_HANDOFF_KEY,
      JSON.stringify(
        buildPrInsightChatHandoffDraft({
          pullRequestId: item.pullRequestId,
          title: item.title,
          repository: item.repository,
          repoPath: item.repoPath || ".",
          projectLinkId: prInsightArtifactProjectLinkId(item),
          kind: item.kind,
          artifactId: item.id,
        }),
      ),
    );
    navigate("/chat");
  }

  function openPrInsightInPullRequests(item: PrInsightActivityItem): void {
    sessionStorage.setItem(
      PULL_REQUESTS_HANDOFF_KEY,
      JSON.stringify(
        buildPullRequestsPrHandoffDraft({
          projectLinkId: prInsightArtifactProjectLinkId(item),
          repository: item.repository,
          pullRequestId: item.pullRequestId,
          artifactId: item.id,
        }),
      ),
    );
    navigate("/pulls");
  }

  function copyPrInsightArtifactId(item: PrInsightActivityItem): void {
    const write = navigator.clipboard?.writeText(item.id);
    if (!write) return;
    void write.then(() => {
      setCopiedPrInsightId(item.id);
      window.setTimeout(
        () => setCopiedPrInsightId((current) => (current === item.id ? null : current)),
        2000,
      );
    });
  }

  return (
    <div className="flex min-h-full w-full gap-5">
      <ActivitySidebar
        projectLinks={projectLinks}
        tasks={tasks}
        selectedTaskId={selectedId}
        loading={loading}
        activeCount={activeCount}
        error={error}
        checkpointActivity={checkpointActivity}
        checkpointLoading={checkpointLoading}
        selectedCheckpointId={selectedCheckpointId}
        prInsightActivity={filteredPrInsightActivity}
        prInsightLoading={prInsightLoading}
        prInsightProjectLinkFilter={prInsightProjectLinkFilter}
        prInsightKindFilter={prInsightKindFilter}
        prInsightHistoryMeta={prInsightHistoryMeta}
        selectedPrInsightId={selectedPrInsightId}
        reviewActivity={filteredReviewActivity}
        reviewLoading={reviewLoading}
        reviewProjectLinkFilter={reviewProjectLinkFilter}
        reviewKindFilter={reviewKindFilter}
        selectedReviewId={selectedReviewId}
        onRefreshAll={() => void refreshAll()}
        onSelectTask={selectTask}
        onSelectCheckpoint={selectCheckpointActivity}
        onSelectPrInsight={selectPrInsightActivity}
        onSelectReview={selectReviewActivity}
        onPrInsightProjectLinkFilterChange={setPrInsightProjectLinkFilter}
        onPrInsightKindFilterChange={setPrInsightKindFilter}
        onReviewProjectLinkFilterChange={setReviewProjectLinkFilter}
        onReviewKindFilterChange={setReviewKindFilter}
      />

      <section className="min-w-0 flex-1">
        {!selected && !selectedReview && !selectedPrInsight && !selectedCheckpoint && (
          <div className="flex h-full items-center justify-center text-center text-sm text-zinc-600">
            <div>
              <p className="font-medium text-zinc-500">No operation selected</p>
              <p className="mt-1">Choose a run, checkpoint, PR insight, or review action to inspect what happened.</p>
            </div>
          </div>
        )}

        {selected && <TaskRunDetailPanel task={selected} />}

        {selectedCheckpoint && (
          <CheckpointDetailPanel
            checkpoint={selectedCheckpoint}
            preview={checkpointPreview}
            rollbackPlan={checkpointRollbackPlan}
            previewLoading={checkpointPreviewLoading}
            rollbackLoading={checkpointRollbackLoading}
            onOpenRollbackPlanInChat={openRollbackPlanInChat}
          />
        )}

        {selectedPrInsight && (
          <PrInsightDetailPanel
            item={selectedPrInsight}
            comparison={selectedPrInsightComparison}
            refreshComparison={selectedPrInsightRefreshComparison}
            copiedArtifactId={copiedPrInsightId}
            onCopyArtifactId={copyPrInsightArtifactId}
            onOpenInChat={openPrInsightInChat}
            onOpenInPullRequests={openPrInsightInPullRequests}
          />
        )}

        {selectedReview && <ReviewOperationDetailPanel operation={selectedReview} />}
      </section>
    </div>
  );
}
