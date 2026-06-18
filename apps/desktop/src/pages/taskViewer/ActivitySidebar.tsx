import type {
  ChatCheckpointActivity,
  PrInsightArtifactHistoryMeta,
  PrInsightArtifactRecord,
  TaskView,
  ProjectLink,
} from "../../api.js";
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
  onPrInsightProjectLinkFilterChange,
  onPrInsightKindFilterChange,
  onReviewProjectLinkFilterChange,
  onReviewKindFilterChange,
}: ActivitySidebarProps): JSX.Element {
  return (
    <section className="flex w-[360px] shrink-0 flex-col border-r border-zinc-800/70 pr-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Activity</h2>
          <p className="mt-1 text-sm text-zinc-500">Agent runs and background jobs.</p>
        </div>
        <button
          onClick={onRefreshAll}
          className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
        >
          Refresh
        </button>
      </div>

      {activeCount > 0 && (
        <div className="mb-3 rounded-md border border-blue-900/50 bg-blue-950/20 px-3 py-2 text-xs text-blue-300">
          {activeCount} active run{activeCount === 1 ? "" : "s"}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <TaskRunList
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        loading={loading}
        onSelectTask={onSelectTask}
      />
      <CheckpointActivityList
        checkpointActivity={checkpointActivity}
        checkpointLoading={checkpointLoading}
        selectedCheckpointId={selectedCheckpointId}
        onSelectCheckpoint={onSelectCheckpoint}
      />
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
    </section>
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
    <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5">
      {loading && <p className="px-1 text-sm text-zinc-600">Loading activity...</p>}
      {!loading && tasks.length === 0 && (
        <p className="px-1 text-sm text-zinc-600">No agent runs yet.</p>
      )}
      {tasks.map((task) => {
        const selectedTask = task.id === selectedTaskId;
        return (
          <button
            key={task.id}
            onClick={() => onSelectTask(task.id)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
              selectedTask
                ? "border-zinc-700 bg-zinc-900"
                : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusClass(task.status)}`}
              >
                {task.status}
              </span>
              <span className="truncate text-xs text-zinc-600">{formatTime(task.createdAt)}</span>
            </div>
            <p className="truncate text-sm font-medium text-zinc-200">{taskTitle(task)}</p>
            <p className="mt-1 truncate text-xs text-zinc-600">{latestDetail(task)}</p>
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
    <div className="mt-5 border-t border-zinc-800/70 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Checkpoint Activity
        </h3>
        {checkpointLoading && <span className="text-[11px] text-zinc-700">Loading</span>}
      </div>
      <div className="max-h-[220px] overflow-y-auto space-y-1.5">
        {!checkpointLoading && checkpointActivity.length === 0 && (
          <p className="px-1 text-xs text-zinc-600">No Git checkpoints yet.</p>
        )}
        {checkpointActivity.slice(0, 8).map((event) => {
          const selectedEvent = event.id === selectedCheckpointId;
          return (
            <button
              key={event.id}
              onClick={() => onSelectCheckpoint(event.id)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                selectedEvent
                  ? "border-zinc-700 bg-zinc-900"
                  : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${reviewOperationStatusClass(event.toolOk !== false)}`}
                >
                  {checkpointActivityKindLabel(event)}
                </span>
                <span className="truncate text-xs text-zinc-600">{formatTime(event.at)}</span>
              </div>
              <p className="truncate text-sm font-medium text-zinc-200">{event.toolName}</p>
              <p className="mt-1 truncate font-mono text-xs text-zinc-600">
                {checkpointActivityDetail(event)}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
