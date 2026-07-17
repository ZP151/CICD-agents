import type {
  ChatCheckpointActivity,
  PrInsightArtifactHistoryMeta,
  PrInsightArtifactRecord,
  TaskView,
  ProjectLink,
} from "../../api.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  duration,
  formatTime,
  latestDetail,
  reviewOperationStatusClass,
  statusClass,
  taskTitle,
} from "./activityPresentation.js";
import type { ReviewActivityItem } from "./activityTypes.js";
import { checkpointActivityDetail, checkpointActivityKindLabel } from "./checkpointActivity.js";
import { PrInsightActivitySection } from "./PrInsightActivitySection.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";
import { ReviewActivitySection } from "./ReviewActivitySection.js";

interface ActivitySidebarProps {
  projectLinks: ProjectLink[];
  tasks: TaskView[];
  selectedTaskId: string | null;
  loading: boolean;
  activeCount: number;
  error: string | null;
  checkpointActivity: ChatCheckpointActivity[];
  checkpointLoading: boolean;
  selectedCheckpointId: string | null;
  prInsightActivity: PrInsightActivityItem[];
  prInsightLoading: boolean;
  prInsightProjectLinkFilter: string;
  prInsightKindFilter: PrInsightArtifactRecord["kind"] | "all";
  prInsightHistoryMeta: Map<
    string,
    Pick<PrInsightArtifactHistoryMeta, "index" | "total" | "latest">
  >;
  selectedPrInsightId: string | null;
  reviewActivity: ReviewActivityItem[];
  reviewLoading: boolean;
  reviewProjectLinkFilter: string;
  reviewKindFilter: ReviewActivityItem["kind"] | "all";
  selectedReviewId: string | null;
  onRefreshAll: () => void;
  onSelectTask: (taskId: string) => void;
  onSelectCheckpoint: (eventId: string) => void;
  onSelectPrInsight: (eventId: string) => void;
  onSelectReview: (eventId: string) => void;
  onClearSelection: () => void;
  onPrInsightProjectLinkFilterChange: (value: string) => void;
  onPrInsightKindFilterChange: (value: PrInsightArtifactRecord["kind"] | "all") => void;
  onReviewProjectLinkFilterChange: (value: string) => void;
  onReviewKindFilterChange: (value: ReviewActivityItem["kind"] | "all") => void;
}

export function ActivitySidebar({
  projectLinks,
  tasks,
  selectedTaskId,
  loading,
  activeCount,
  error,
  checkpointActivity,
  checkpointLoading,
  selectedCheckpointId,
  prInsightActivity,
  prInsightLoading,
  prInsightProjectLinkFilter,
  prInsightKindFilter,
  prInsightHistoryMeta,
  selectedPrInsightId,
  reviewActivity,
  reviewLoading,
  reviewProjectLinkFilter,
  reviewKindFilter,
  selectedReviewId,
  onRefreshAll,
  onSelectTask,
  onSelectCheckpoint,
  onSelectPrInsight,
  onSelectReview,
  onClearSelection,
  onPrInsightProjectLinkFilterChange,
  onPrInsightKindFilterChange,
  onReviewProjectLinkFilterChange,
  onReviewKindFilterChange,
}: ActivitySidebarProps): JSX.Element {
  const [sectionFilter, setSectionFilter] = useState<ActivitySectionFilter>("all");
  const sectionOptions = useMemo(
    () =>
      activitySectionOptions({
        runs: tasks.length,
        checkpoints: checkpointActivity.length,
        prInsights: prInsightActivity.length,
        reviewOperations: reviewActivity.length,
      }),
    [checkpointActivity.length, prInsightActivity.length, reviewActivity.length, tasks.length],
  );
  const showRuns = sectionFilter === "all" || sectionFilter === "runs";
  const showCheckpoints = sectionFilter === "all" || sectionFilter === "checkpoints";
  const showPrInsights = sectionFilter === "all" || sectionFilter === "pr_insights";
  const showReviewOps = sectionFilter === "all" || sectionFilter === "review_operations";

  const selectFirstInSection = useCallback((nextFilter: ActivitySectionFilter): void => {
    if (nextFilter === "runs") {
      const first = tasks[0];
      if (first) onSelectTask(first.id);
      else onClearSelection();
      return;
    }
    if (nextFilter === "checkpoints") {
      const first = checkpointActivity[0];
      if (first) onSelectCheckpoint(first.id);
      else onClearSelection();
      return;
    }
    if (nextFilter === "pr_insights") {
      const first = prInsightActivity[0];
      if (first) onSelectPrInsight(first.id);
      else onClearSelection();
      return;
    }
    if (nextFilter === "review_operations") {
      const first = reviewActivity[0];
      if (first) onSelectReview(first.id);
      else onClearSelection();
    }
  }, [
    checkpointActivity,
    onClearSelection,
    onSelectCheckpoint,
    onSelectPrInsight,
    onSelectReview,
    onSelectTask,
    prInsightActivity,
    reviewActivity,
    tasks,
  ]);

  function changeSectionFilter(nextFilter: ActivitySectionFilter): void {
    setSectionFilter(nextFilter);
    selectFirstInSection(nextFilter);
  }

  useEffect(() => {
    if (sectionFilter === "all") return;

    if (
      sectionFilter === "runs" &&
      (tasks.length > 0 || selectedTaskId !== null) &&
      !tasks.some((task) => task.id === selectedTaskId)
    ) {
      selectFirstInSection("runs");
      return;
    }
    if (
      sectionFilter === "checkpoints" &&
      (checkpointActivity.length > 0 || selectedCheckpointId !== null) &&
      !checkpointActivity.some((event) => event.id === selectedCheckpointId)
    ) {
      selectFirstInSection("checkpoints");
      return;
    }
    if (
      sectionFilter === "pr_insights" &&
      (prInsightActivity.length > 0 || selectedPrInsightId !== null) &&
      !prInsightActivity.some((event) => event.id === selectedPrInsightId)
    ) {
      selectFirstInSection("pr_insights");
      return;
    }
    if (
      sectionFilter === "review_operations" &&
      (reviewActivity.length > 0 || selectedReviewId !== null) &&
      !reviewActivity.some((event) => event.id === selectedReviewId)
    ) {
      selectFirstInSection("review_operations");
    }
  }, [
    checkpointActivity,
    prInsightActivity,
    reviewActivity,
    sectionFilter,
    selectFirstInSection,
    selectedCheckpointId,
    selectedPrInsightId,
    selectedReviewId,
    selectedTaskId,
    tasks,
  ]);

  return (
    <section className="flex w-[380px] shrink-0 flex-col border-r border-[rgb(var(--app-border))] pr-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[rgb(var(--app-text))]">Activity</h2>
          <p className="mt-1 text-sm text-[rgb(var(--app-text-subtle))]">
            Operational history by source.
          </p>
        </div>
        <button
          onClick={onRefreshAll}
          className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:text-[rgb(var(--app-text))]"
        >
          Refresh
        </button>
      </div>

      {activeCount > 0 && (
        <div className="mb-3 rounded-md border border-[rgb(var(--app-accent))]/30 bg-[rgb(var(--app-accent-soft))] px-3 py-2 text-xs text-[rgb(var(--app-accent))]">
          {activeCount} active run{activeCount === 1 ? "" : "s"}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="mb-3 grid grid-cols-2 gap-1.5" aria-label="Activity sections">
        {sectionOptions.map((section) => (
          <button
            key={section.key}
            type="button"
            aria-pressed={sectionFilter === section.key}
            onClick={() => changeSectionFilter(section.key)}
            className={`rounded-md border px-2 py-1.5 text-left transition ${
              sectionFilter === section.key
                ? "border-[rgb(var(--app-accent))]/45 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))]"
                : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:text-[rgb(var(--app-text))]"
            }`}
          >
            <span className="block text-xs font-medium">{section.label}</span>
            <span className="mt-0.5 block text-[10px] text-[rgb(var(--app-text-subtle))]">
              {section.count}
            </span>
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {showRuns && (
          <TaskRunList
            tasks={tasks}
            selectedTaskId={selectedTaskId}
            loading={loading}
            onSelectTask={onSelectTask}
          />
        )}
        {showCheckpoints && (
          <CheckpointActivityList
            checkpointActivity={checkpointActivity}
            checkpointLoading={checkpointLoading}
            selectedCheckpointId={selectedCheckpointId}
            onSelectCheckpoint={onSelectCheckpoint}
          />
        )}
        {showPrInsights && (
          <div
            className={
              showRuns || showCheckpoints
                ? "mt-5 border-t border-[rgb(var(--app-border))] pt-4"
                : ""
            }
          >
            <PrInsightActivitySection
              projectLinks={projectLinks}
              prInsightActivity={prInsightActivity}
              prInsightLoading={prInsightLoading}
              prInsightProjectLinkFilter={prInsightProjectLinkFilter}
              prInsightKindFilter={prInsightKindFilter}
              prInsightHistoryMeta={prInsightHistoryMeta}
              selectedPrInsightId={selectedPrInsightId}
              onSelectPrInsight={onSelectPrInsight}
              onPrInsightProjectLinkFilterChange={onPrInsightProjectLinkFilterChange}
              onPrInsightKindFilterChange={onPrInsightKindFilterChange}
            />
          </div>
        )}
        {showReviewOps && (
          <div
            className={
              showRuns || showCheckpoints || showPrInsights
                ? "mt-5 border-t border-[rgb(var(--app-border))] pt-4"
                : ""
            }
          >
            <ReviewActivitySection
              projectLinks={projectLinks}
              reviewActivity={reviewActivity}
              reviewLoading={reviewLoading}
              reviewProjectLinkFilter={reviewProjectLinkFilter}
              reviewKindFilter={reviewKindFilter}
              selectedReviewId={selectedReviewId}
              onSelectReview={onSelectReview}
              onReviewProjectLinkFilterChange={onReviewProjectLinkFilterChange}
              onReviewKindFilterChange={onReviewKindFilterChange}
            />
          </div>
        )}
      </div>
    </section>
  );
}

type ActivitySectionFilter = "all" | "runs" | "checkpoints" | "pr_insights" | "review_operations";

function activitySectionOptions(counts: {
  runs: number;
  checkpoints: number;
  prInsights: number;
  reviewOperations: number;
}): Array<{ key: ActivitySectionFilter; label: string; count: string }> {
  return [
    {
      key: "all",
      label: "All",
      count: String(counts.runs + counts.checkpoints + counts.prInsights + counts.reviewOperations),
    },
    { key: "runs", label: "Runs", count: String(counts.runs) },
    { key: "checkpoints", label: "Checkpoints", count: String(counts.checkpoints) },
    { key: "pr_insights", label: "PR Insights", count: String(counts.prInsights) },
    { key: "review_operations", label: "Reviews", count: String(counts.reviewOperations) },
  ];
}

function ActivitySectionHeader({
  title,
  count,
  loading,
}: {
  title: string;
  count: number;
  loading: boolean;
}): JSX.Element {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
        {title}
      </h3>
      <span className="rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 text-[11px] text-[rgb(var(--app-text-subtle))]">
        {loading ? "Loading" : count}
      </span>
    </div>
  );
}

function TaskRunList({
  tasks,
  selectedTaskId,
  loading,
  onSelectTask,
}: {
  tasks: TaskView[];
  selectedTaskId: string | null;
  loading: boolean;
  onSelectTask: (taskId: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-1.5">
      <ActivitySectionHeader title="Runs" count={tasks.length} loading={loading} />
      {loading && tasks.length === 0 && (
        <div className="grid gap-1.5" aria-label="Checking runs">
          <span className="h-14 animate-pulse rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
          <span className="h-14 animate-pulse rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
        </div>
      )}
      {!loading && tasks.length === 0 && (
        <p className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
          No agent runs recorded yet.
        </p>
      )}
      {tasks.map((task) => {
        const selectedTask = task.id === selectedTaskId;
        return (
          <button
            key={task.id}
            onClick={() => onSelectTask(task.id)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
              selectedTask
                ? "border-[rgb(var(--app-accent))]/50 bg-[rgb(var(--app-accent-soft))]"
                : "border-transparent hover:border-[rgb(var(--app-border))] hover:bg-[rgb(var(--app-surface-raised))]"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusClass(task.status)}`}
              >
                {task.status}
              </span>
              <span className="truncate text-xs text-[rgb(var(--app-text-muted))]">
                {formatTime(task.createdAt)}
              </span>
            </div>
            <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]">
              {taskTitle(task)}
            </p>
            <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-muted))]">
              {latestDetail(task)}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function CheckpointActivityList({
  checkpointActivity,
  checkpointLoading,
  selectedCheckpointId,
  onSelectCheckpoint,
}: {
  checkpointActivity: ChatCheckpointActivity[];
  checkpointLoading: boolean;
  selectedCheckpointId: string | null;
  onSelectCheckpoint: (eventId: string) => void;
}): JSX.Element {
  return (
    <div className="mt-5 border-t border-[rgb(var(--app-border))] pt-4">
      <ActivitySectionHeader
        title="Checkpoints"
        count={checkpointActivity.length}
        loading={checkpointLoading}
      />
      <div className="max-h-[220px] overflow-y-auto space-y-1.5">
        {!checkpointLoading && checkpointActivity.length === 0 && (
          <p className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
            No Git checkpoints yet.
          </p>
        )}
        {checkpointActivity.slice(0, 8).map((event) => {
          const selectedEvent = event.id === selectedCheckpointId;
          return (
            <button
              key={event.id}
              onClick={() => onSelectCheckpoint(event.id)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                selectedEvent
                  ? "border-[rgb(var(--app-accent))]/50 bg-[rgb(var(--app-accent-soft))]"
                  : "border-transparent hover:border-[rgb(var(--app-border))] hover:bg-[rgb(var(--app-surface-raised))]"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${reviewOperationStatusClass(event.toolOk !== false)}`}
                >
                  {checkpointActivityKindLabel(event)}
                </span>
                <span className="truncate text-xs text-[rgb(var(--app-text-muted))]">
                  {formatTime(event.at)}
                </span>
              </div>
              <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]">
                {event.toolName}
              </p>
              <p className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-muted))]">
                {checkpointActivityDetail(event)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
