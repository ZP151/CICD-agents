import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../App.js";
import { WorkbenchPage } from "../components/workbench/WorkbenchPrimitives.js";
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
    refreshing,
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
    clearSelection,
    setPrInsightProjectLinkFilter,
    setPrInsightKindFilter,
    setReviewProjectLinkFilter,
    setReviewKindFilter,
  } = runtime;
  const visibleActivityCount =
    tasks.length +
    checkpointActivity.length +
    filteredPrInsightActivity.length +
    filteredReviewActivity.length;

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
    <WorkbenchPage className={taskViewerLayoutClass()}>
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
        onClearSelection={clearSelection}
        onPrInsightProjectLinkFilterChange={setPrInsightProjectLinkFilter}
        onPrInsightKindFilterChange={setPrInsightKindFilter}
        onReviewProjectLinkFilterChange={setReviewProjectLinkFilter}
        onReviewKindFilterChange={setReviewKindFilter}
      />

      <section className={taskViewerDetailClass()}>
        {refreshing && (
          <p className="mb-3 text-xs text-[rgb(var(--app-text-subtle))]">
            Refreshing activity...
          </p>
        )}

        {!selected && !selectedReview && !selectedPrInsight && !selectedCheckpoint && (
          <ActivityEmptyDetail
            activityCount={visibleActivityCount}
            error={error}
            loading={loading || checkpointLoading || prInsightLoading || reviewLoading}
          />
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
    </WorkbenchPage>
  );
}

export function taskViewerLayoutClass(): string {
  return "min-w-0 items-stretch gap-4 xl:flex-row";
}

export function taskViewerDetailClass(): string {
  return "w-full min-w-0 flex-1 xl:basis-0";
}

export function ActivityEmptyDetail({
  activityCount = 1,
  error = null,
  loading = false,
}: {
  activityCount?: number;
  error?: string | null;
  loading?: boolean;
}): JSX.Element {
  const content = activityEmptyDetailContent({ activityCount, error, loading });

  return (
    <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
      <p className="text-xs font-semibold uppercase text-[rgb(var(--app-text-subtle))]">
        Detail
      </p>
      <h3 className="mt-2 text-sm font-semibold text-[rgb(var(--app-text))]">
        {content.title}
      </h3>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
        {content.description}
      </p>
    </div>
  );
}

export function activityEmptyDetailContent({
  activityCount,
  error,
  loading,
}: {
  activityCount: number;
  error: string | null;
  loading: boolean;
}): { title: string; description: string } {
  if (error && activityCount === 0) {
    return {
      title: "Recovery needed",
      description:
        "The activity sources did not load. Use Refresh activity in the source panel, or open Settings to check the desktop daemon and account session.",
    };
  }

  if (loading && activityCount === 0) {
    return {
      title: "Checking activity",
      description:
        "MergePilot is loading recent runs, checkpoints, PR insights, and review operations.",
    };
  }

  if (activityCount === 0) {
    return {
      title: "No activity recorded",
      description:
        "Runs, Git checkpoints, PR insights, and review operations will appear here after the agent performs workspace actions.",
    };
  }

  return {
    title: "Select an operation",
    description:
      "Choose a run, checkpoint, PR insight, or review action to inspect its source, result, and recovery path.",
  };
}
