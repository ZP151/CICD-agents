import type {
  ChatCheckpointActivity,
  PrInsightArtifactHistoryMeta,
  PrInsightArtifactRecord,
  TaskView,
  ProjectLink,
} from "../../api.js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isTemporaryProjectLink } from "../../projectLinks.js";
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
import { partitionActivity } from "./activityGrouping.js";
import {
  ActionButton,
  ActionLink,
  InlineNotice,
  WorkbenchFilterTabs,
} from "../../components/workbench/WorkbenchPrimitives.js";

interface ActivitySidebarProps {
  projectLinks: ProjectLink[];
  tasks: TaskView[];
  selectedTaskId: string | null;
  loading: boolean;
  refreshing: boolean;
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
  refreshing,
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
  const [temporaryActivityOpen, setTemporaryActivityOpen] = useState(false);
  const temporaryProjectLinkIds = useMemo(
    () => new Set(projectLinks.filter(isTemporaryProjectLink).map((link) => link.id)),
    [projectLinks],
  );
  const checkpointGroups = useMemo(
    () => partitionActivity(checkpointActivity, temporaryProjectLinkIds),
    [checkpointActivity, temporaryProjectLinkIds],
  );
  const prInsightGroups = useMemo(
    () => partitionActivity(prInsightActivity, temporaryProjectLinkIds),
    [prInsightActivity, temporaryProjectLinkIds],
  );
  const reviewGroups = useMemo(
    () => partitionActivity(reviewActivity, temporaryProjectLinkIds),
    [reviewActivity, temporaryProjectLinkIds],
  );
  const primaryCheckpoints = checkpointGroups.primary;
  const primaryPrInsights = prInsightGroups.primary;
  const primaryReviews = reviewGroups.primary;
  const temporaryActivityCount =
    checkpointGroups.temporary.length + prInsightGroups.temporary.length + reviewGroups.temporary.length;
  const selectedTemporaryActivity =
    checkpointGroups.temporary.some((event) => event.id === selectedCheckpointId) ||
    prInsightGroups.temporary.some((event) => event.id === selectedPrInsightId) ||
    reviewGroups.temporary.some((event) => event.id === selectedReviewId);
  const sectionOptions = useMemo(
    () =>
      activitySectionOptions({
        runs: tasks.length,
        checkpoints: primaryCheckpoints.length,
        prInsights: primaryPrInsights.length,
        reviewOperations: primaryReviews.length,
      }),
    [primaryCheckpoints.length, primaryPrInsights.length, primaryReviews.length, tasks.length],
  );
  const visibleSections = activityVisibleSections({
    sectionFilter,
    runs: tasks.length,
    checkpoints: primaryCheckpoints.length,
    prInsights: primaryPrInsights.length,
    reviewOperations: primaryReviews.length,
    loading,
    checkpointLoading,
    prInsightLoading,
    reviewLoading,
  });
  const showRuns = visibleSections.runs;
  const showCheckpoints = visibleSections.checkpoints;
  const showPrInsights = visibleSections.prInsights;
  const showReviewOps = visibleSections.reviewOperations;
  const activityCount =
    tasks.length + primaryCheckpoints.length + primaryPrInsights.length + primaryReviews.length;
  const anyActivityLoading = loading || checkpointLoading || prInsightLoading || reviewLoading;
  const activityUnavailable = Boolean(error && activityCount === 0 && !anyActivityLoading);
  const initialActivityLoading = anyActivityLoading && activityCount === 0 && !activityUnavailable;

  const selectFirstInSection = useCallback((nextFilter: ActivitySectionFilter): void => {
    if (nextFilter === "runs") {
      const first = tasks[0];
      if (first) onSelectTask(first.id);
      else onClearSelection();
      return;
    }
    if (nextFilter === "checkpoints") {
      const first = primaryCheckpoints[0];
      if (first) onSelectCheckpoint(first.id);
      else onClearSelection();
      return;
    }
    if (nextFilter === "pr_insights") {
      const first = primaryPrInsights[0];
      if (first) onSelectPrInsight(first.id);
      else onClearSelection();
      return;
    }
    if (nextFilter === "review_operations") {
      const first = primaryReviews[0];
      if (first) onSelectReview(first.id);
      else onClearSelection();
    }
  }, [
    primaryCheckpoints,
    onClearSelection,
    onSelectCheckpoint,
    onSelectPrInsight,
    onSelectReview,
    onSelectTask,
    primaryPrInsights,
    primaryReviews,
    tasks,
  ]);

  function changeSectionFilter(nextFilter: ActivitySectionFilter): void {
    setSectionFilter(nextFilter);
    selectFirstInSection(nextFilter);
  }

  useEffect(() => {
    if (selectedTemporaryActivity) setTemporaryActivityOpen(true);
  }, [selectedTemporaryActivity]);

  useEffect(() => {
    if (sectionFilter === "all") return;

    if (
      sectionFilter === "runs" &&
      (
        tasks.length > 0 ||
        selectedTaskId !== null ||
        selectedCheckpointId !== null ||
        selectedPrInsightId !== null ||
        selectedReviewId !== null
      ) &&
      !tasks.some((task) => task.id === selectedTaskId)
    ) {
      selectFirstInSection("runs");
      return;
    }
    if (
      sectionFilter === "checkpoints" &&
      (
        primaryCheckpoints.length > 0 ||
        selectedTaskId !== null ||
        selectedCheckpointId !== null ||
        selectedPrInsightId !== null ||
        selectedReviewId !== null
      ) &&
      !primaryCheckpoints.some((event) => event.id === selectedCheckpointId)
    ) {
      selectFirstInSection("checkpoints");
      return;
    }
    if (
      sectionFilter === "pr_insights" &&
      (
        primaryPrInsights.length > 0 ||
        selectedTaskId !== null ||
        selectedCheckpointId !== null ||
        selectedPrInsightId !== null ||
        selectedReviewId !== null
      ) &&
      !primaryPrInsights.some((event) => event.id === selectedPrInsightId)
    ) {
      selectFirstInSection("pr_insights");
      return;
    }
    if (
      sectionFilter === "review_operations" &&
      (
        primaryReviews.length > 0 ||
        selectedTaskId !== null ||
        selectedCheckpointId !== null ||
        selectedPrInsightId !== null ||
        selectedReviewId !== null
      ) &&
      !primaryReviews.some((event) => event.id === selectedReviewId)
    ) {
      selectFirstInSection("review_operations");
    }
  }, [
    primaryCheckpoints,
    primaryPrInsights,
    primaryReviews,
    sectionFilter,
    selectFirstInSection,
    selectedCheckpointId,
    selectedPrInsightId,
    selectedReviewId,
    selectedTaskId,
    tasks,
  ]);

  return (
    <section className={activitySidebarShellClass()}>
      <div className="mb-2 flex items-start justify-between gap-3 xl:mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[rgb(var(--app-text))] xl:text-xl">Activity</h2>
        </div>
        <ActionButton
          type="button"
          onClick={onRefreshAll}
          loading={refreshing}
          className="min-w-[5.5rem]"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </ActionButton>
      </div>

      {activeCount > 0 && (
        <InlineNotice tone="info">{activeCount} active run{activeCount === 1 ? "" : "s"}</InlineNotice>
      )}

      {error && !activityUnavailable && (
        <InlineNotice tone="danger" title="Activity refresh failed">{error}</InlineNotice>
      )}

      {activityUnavailable ? (
        <ActivitySidebarUnavailableState
          error={error ?? "Failed to load activity"}
          onRefresh={onRefreshAll}
        />
      ) : (
        <>
          <WorkbenchFilterTabs
            ariaLabel="Activity sections"
            className={activitySectionFilterGridClass()}
            options={sectionOptions.map((section) => ({
              value: section.key,
              label: section.shortLabel,
              count: section.count,
              title: `${section.label}: ${section.count}`,
            }))}
            value={sectionFilter}
            onValueChange={changeSectionFilter}
          />

          {initialActivityLoading ? (
            <ActivitySidebarLoadingState />
          ) : (
            <div className={activitySidebarListClass()}>
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
                  checkpointActivity={primaryCheckpoints}
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
                    prInsightActivity={primaryPrInsights}
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
                    reviewActivity={primaryReviews}
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
              {temporaryActivityCount > 0 && (
                <TemporaryActivityHistory
                  open={temporaryActivityOpen}
                  count={temporaryActivityCount}
                  showCheckpoints={showCheckpoints}
                  showPrInsights={showPrInsights}
                  showReviewOps={showReviewOps}
                  checkpointActivity={checkpointGroups.temporary}
                  checkpointLoading={checkpointLoading}
                  selectedCheckpointId={selectedCheckpointId}
                  onSelectCheckpoint={onSelectCheckpoint}
                  prInsightActivity={prInsightGroups.temporary}
                  prInsightLoading={prInsightLoading}
                  prInsightProjectLinkFilter={prInsightProjectLinkFilter}
                  prInsightKindFilter={prInsightKindFilter}
                  prInsightHistoryMeta={prInsightHistoryMeta}
                  selectedPrInsightId={selectedPrInsightId}
                  onSelectPrInsight={onSelectPrInsight}
                  onPrInsightProjectLinkFilterChange={onPrInsightProjectLinkFilterChange}
                  onPrInsightKindFilterChange={onPrInsightKindFilterChange}
                  reviewActivity={reviewGroups.temporary}
                  reviewLoading={reviewLoading}
                  reviewProjectLinkFilter={reviewProjectLinkFilter}
                  reviewKindFilter={reviewKindFilter}
                  selectedReviewId={selectedReviewId}
                  onSelectReview={onSelectReview}
                  onReviewProjectLinkFilterChange={onReviewProjectLinkFilterChange}
                  onReviewKindFilterChange={onReviewKindFilterChange}
                  projectLinks={projectLinks}
                  onToggle={() => setTemporaryActivityOpen((open) => !open)}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function ActivitySidebarUnavailableState({
  error,
  onRefresh,
}: {
  error: string;
  onRefresh?: () => void;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
      <p className="text-xs font-semibold text-[rgb(var(--app-text))]">Sources unavailable</p>
      <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
        Refresh activity, or check the desktop daemon and account session.
      </p>
      <p className="mt-2 truncate text-[11px] text-[rgb(var(--app-danger))]" title={error}>
        {error}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {onRefresh && (
          <ActionButton type="button" onClick={onRefresh}>Refresh activity</ActionButton>
        )}
        <ActionLink
          href="#/settings"
        >
          Open Settings
        </ActionLink>
      </div>
    </div>
  );
}

export function activitySidebarShellClass(): string {
  return [
    "flex w-full shrink-0 flex-col border-b border-[rgb(var(--app-border))] pb-3",
    "xl:max-h-[calc(100vh-5rem)] xl:w-[clamp(16rem,24vw,21rem)] xl:border-b-0 xl:border-r xl:pb-0 xl:pr-4",
  ].join(" ");
}

export function activitySidebarListClass(): string {
  return "min-h-0 max-h-[16rem] overflow-x-hidden overflow-y-auto pr-1 lg:max-h-[18rem] xl:max-h-none xl:flex-1";
}

function TemporaryActivityHistory({
  open,
  count,
  showCheckpoints,
  showPrInsights,
  showReviewOps,
  checkpointActivity,
  checkpointLoading,
  selectedCheckpointId,
  onSelectCheckpoint,
  prInsightActivity,
  prInsightLoading,
  prInsightProjectLinkFilter,
  prInsightKindFilter,
  prInsightHistoryMeta,
  selectedPrInsightId,
  onSelectPrInsight,
  onPrInsightProjectLinkFilterChange,
  onPrInsightKindFilterChange,
  reviewActivity,
  reviewLoading,
  reviewProjectLinkFilter,
  reviewKindFilter,
  selectedReviewId,
  onSelectReview,
  onReviewProjectLinkFilterChange,
  onReviewKindFilterChange,
  projectLinks,
  onToggle,
}: {
  open: boolean;
  count: number;
  showCheckpoints: boolean;
  showPrInsights: boolean;
  showReviewOps: boolean;
  checkpointActivity: ChatCheckpointActivity[];
  checkpointLoading: boolean;
  selectedCheckpointId: string | null;
  onSelectCheckpoint: (eventId: string) => void;
  prInsightActivity: PrInsightActivityItem[];
  prInsightLoading: boolean;
  prInsightProjectLinkFilter: string;
  prInsightKindFilter: PrInsightArtifactRecord["kind"] | "all";
  prInsightHistoryMeta: Map<string, Pick<PrInsightArtifactHistoryMeta, "index" | "total" | "latest">>;
  selectedPrInsightId: string | null;
  onSelectPrInsight: (eventId: string) => void;
  onPrInsightProjectLinkFilterChange: (value: string) => void;
  onPrInsightKindFilterChange: (value: PrInsightArtifactRecord["kind"] | "all") => void;
  reviewActivity: ReviewActivityItem[];
  reviewLoading: boolean;
  reviewProjectLinkFilter: string;
  reviewKindFilter: ReviewActivityItem["kind"] | "all";
  selectedReviewId: string | null;
  onSelectReview: (eventId: string) => void;
  onReviewProjectLinkFilterChange: (value: string) => void;
  onReviewKindFilterChange: (value: ReviewActivityItem["kind"] | "all") => void;
  projectLinks: ProjectLink[];
  onToggle: () => void;
}): JSX.Element {
  return (
    <section className="mt-4 border-t border-[rgb(var(--app-border))] pt-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-1 text-left text-xs font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>Temporary history</span>
        <span className="text-[11px] text-[rgb(var(--app-text-subtle))]">{count} {open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-5 border-l border-[rgb(var(--app-border))] pl-3">
          {showCheckpoints && checkpointActivity.length > 0 && (
            <CheckpointActivityList
              checkpointActivity={checkpointActivity}
              checkpointLoading={checkpointLoading}
              selectedCheckpointId={selectedCheckpointId}
              onSelectCheckpoint={onSelectCheckpoint}
            />
          )}
          {showPrInsights && prInsightActivity.length > 0 && (
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
          )}
          {showReviewOps && reviewActivity.length > 0 && (
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
          )}
        </div>
      )}
    </section>
  );
}

export function activitySectionFilterGridClass(): string {
  return "mb-2 flex min-w-0 flex-wrap items-center gap-1.5";
}

type ActivitySectionFilter = "all" | "runs" | "checkpoints" | "pr_insights" | "review_operations";

export function activityVisibleSections({
  sectionFilter,
  runs,
  checkpoints,
  prInsights,
  reviewOperations,
  loading,
  checkpointLoading,
  prInsightLoading,
  reviewLoading,
}: {
  sectionFilter: ActivitySectionFilter;
  runs: number;
  checkpoints: number;
  prInsights: number;
  reviewOperations: number;
  loading: boolean;
  checkpointLoading: boolean;
  prInsightLoading: boolean;
  reviewLoading: boolean;
}): {
  runs: boolean;
  checkpoints: boolean;
  prInsights: boolean;
  reviewOperations: boolean;
} {
  if (sectionFilter !== "all") {
    return {
      runs: sectionFilter === "runs",
      checkpoints: sectionFilter === "checkpoints",
      prInsights: sectionFilter === "pr_insights",
      reviewOperations: sectionFilter === "review_operations",
    };
  }

  return {
    runs: runs > 0 || loading,
    checkpoints: checkpoints > 0 || checkpointLoading,
    prInsights: prInsights > 0 || prInsightLoading,
    reviewOperations: reviewOperations > 0 || reviewLoading,
  };
}

function activitySectionOptions(counts: {
  runs: number;
  checkpoints: number;
  prInsights: number;
  reviewOperations: number;
}): Array<{ key: ActivitySectionFilter; label: string; shortLabel: string; count: number }> {
  return [
    {
      key: "all",
      label: "All",
      shortLabel: "All",
      count: counts.runs + counts.checkpoints + counts.prInsights + counts.reviewOperations,
    },
    { key: "runs", label: "Runs", shortLabel: "Runs", count: counts.runs },
    { key: "checkpoints", label: "Checkpoints", shortLabel: "Git", count: counts.checkpoints },
    { key: "pr_insights", label: "PR Insights", shortLabel: "PR", count: counts.prInsights },
    { key: "review_operations", label: "Reviews", shortLabel: "Reviews", count: counts.reviewOperations },
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
        {loading ? "..." : count}
      </span>
    </div>
  );
}

export function ActivitySidebarLoadingState(): JSX.Element {
  return (
    <div
      className="mt-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3"
      aria-label="Checking activity sources"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[rgb(var(--app-text))]">
            Checking activity sources
          </p>
          <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
            Runs, checkpoints, PR insights, and reviews are loading.
          </p>
        </div>
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[rgb(var(--app-accent))]" />
      </div>
      <div className="mt-3 grid gap-1.5" aria-hidden="true">
        <span className="h-10 animate-pulse rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]" />
        <span className="h-10 animate-pulse rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]" />
      </div>
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
      <div className="space-y-1.5">
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
              <p
                className="mt-1 truncate font-mono text-xs text-[rgb(var(--app-text-muted))]"
                title={event.repoPath}
              >
                {checkpointActivityDetail(event)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
