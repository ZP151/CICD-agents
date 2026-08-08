import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAppData } from "../App.js";
import {
  ActionButton,
  WorkbenchEmptyState,
  WorkbenchPage,
  WorkbenchSidePanel,
} from "../components/workbench/WorkbenchPrimitives.js";
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
import { TaskRunDetailPanel } from "./taskViewer/TaskRunDetailPanel.js";
import {
  duration,
  formatIsoTime,
  formatTime,
  taskTitle,
} from "./taskViewer/activityPresentation.js";
import { checkpointActivityKindLabel } from "./taskViewer/checkpointActivity.js";
import type { PrInsightActivityItem } from "./taskViewer/prInsightActivity.js";
import type { ChatCheckpointActivity, TaskView } from "../api.js";
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
    selectedCheckpointId,
    activityHandoffSource,
    refreshAll,
    selectTask,
    selectCheckpointActivity,
    selectPrInsightActivity,
    clearSelection,
    setPrInsightProjectLinkFilter,
    setPrInsightKindFilter,
  } = runtime;
  const drawerPresentation = activityDrawerPresentation({
    task: selected,
    checkpoint: selectedCheckpoint,
    prInsight: selectedPrInsight,
  });

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

  const drawerActions = selectedPrInsight ? (
    <>
      {activityHandoffSource === "chat" && (
        <ActionButton type="button" tone="quiet" className="min-h-7 px-2" onClick={() => navigate("/chat")}>
          Back to Chat
        </ActionButton>
      )}
      <ActionButton
        type="button"
        tone="quiet"
        className="min-h-7 px-2"
        onClick={() => openPrInsightInPullRequests(selectedPrInsight)}
      >
        Open PR
      </ActionButton>
      <ActionButton
        type="button"
        tone="quiet"
        className="min-h-7 px-2"
        onClick={() => openPrInsightInChat(selectedPrInsight)}
      >
        Ask in Chat
      </ActionButton>
    </>
  ) : undefined;

  return (
    <WorkbenchPage className={taskViewerLayoutClass()}>
      <ActivitySidebar
        projectLinks={projectLinks}
        tasks={tasks}
        selectedTaskId={selectedId}
        loading={loading}
        refreshing={refreshing}
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
        onRefreshAll={() => void refreshAll()}
        onSelectTask={selectTask}
        onSelectCheckpoint={selectCheckpointActivity}
        onSelectPrInsight={selectPrInsightActivity}
        onClearSelection={clearSelection}
        onPrInsightProjectLinkFilterChange={setPrInsightProjectLinkFilter}
        onPrInsightKindFilterChange={setPrInsightKindFilter}
      />

      <WorkbenchSidePanel
        open={Boolean(drawerPresentation)}
        onOpenChange={(open) => {
          if (!open) clearSelection();
        }}
        title={drawerPresentation?.title ?? "Activity detail"}
        description={drawerPresentation?.description}
        actions={drawerActions}
      >
        {selected && <TaskRunDetailPanel task={selected} showHeader={false} />}

        {selectedCheckpoint && (
          <CheckpointDetailPanel
            checkpoint={selectedCheckpoint}
            preview={checkpointPreview}
            rollbackPlan={checkpointRollbackPlan}
            previewLoading={checkpointPreviewLoading}
            rollbackLoading={checkpointRollbackLoading}
            onOpenRollbackPlanInChat={openRollbackPlanInChat}
            showHeader={false}
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
            showHeader={false}
          />
        )}
      </WorkbenchSidePanel>
    </WorkbenchPage>
  );
}

export function taskViewerLayoutClass(): string {
  return "min-w-0";
}

export function taskViewerDetailClass(): string {
  return "w-full min-w-0";
}

export function activityDrawerPresentation({
  task,
  checkpoint,
  prInsight,
}: {
  task: TaskView | null;
  checkpoint: ChatCheckpointActivity | null;
  prInsight: PrInsightActivityItem | null;
}): { title: string; description: string } | null {
  if (task) {
    return {
      title: taskTitle(task),
      description: [task.status, task.kind, duration(task)].filter(Boolean).join(" · "),
    };
  }
  if (checkpoint) {
    return {
      title: checkpoint.targetCheckpointId ? "Checkpoint apply" : "Git checkpoint",
      description: [checkpointActivityKindLabel(checkpoint), checkpoint.toolName, formatTime(checkpoint.at)]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (prInsight) {
    return {
      title: `PR #${prInsight.pullRequestId}`,
      description: [
        prInsight.repository,
        prInsight.kind === "review_run" ? "Full review" : "Preview",
        formatIsoTime(prInsight.at),
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  return null;
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
    <WorkbenchEmptyState
      className="min-h-[18rem]"
      title={content.title}
      description={content.description}
    />
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
        "Could not load activity. Refresh, or check the desktop daemon and account settings.",
    };
  }

  if (loading && activityCount === 0) {
    return {
      title: "Checking activity",
      description: "Loading recent workspace activity.",
    };
  }

  if (activityCount === 0) {
    return {
      title: "No activity recorded",
      description: "Workspace actions will appear here after the agent performs work.",
    };
  }

  return {
      title: "Select an operation",
      description: "Choose an event to inspect its result and recovery path.",
  };
}
