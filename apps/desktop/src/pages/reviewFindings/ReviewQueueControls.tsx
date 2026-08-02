import type { ReviewQueueItem } from "../../api.js";
import { ActionButton, WorkbenchFilterTabs } from "../../components/workbench/WorkbenchPrimitives.js";
import { lanes } from "./reviewQueueViewModel.js";

export interface ReviewQueueControlsProps {
  counts: Record<ReviewQueueItem["decisionQueue"], number>;
  queueFilter: ReviewQueueItem["decisionQueue"] | "all";
  sortMode: "attention" | "recent";
  staleAgeHours: number;
  staleAgeSaving: boolean;
  autoApproveEnabled: boolean;
  autoApproveSaving: boolean;
  batchRerunning: boolean;
  batchMode: "visible" | "stale";
  batchProgress: { done: number; total: number } | null;
  visiblePageCount: number;
  staleCount: number;
  displayedCount: number;
  totalCount: number;
  onQueueFilterChange: (filter: ReviewQueueItem["decisionQueue"] | "all") => void;
  onSortModeChange: (mode: "attention" | "recent") => void;
  onStaleAgeChange: (value: number) => void;
  onStaleAgeSave: (value: number) => void;
  onToggleAutoApprove: () => void;
  onRerunVisible: () => void;
  onRerunStale: () => void;
}

export function ReviewQueueControls({
  counts,
  queueFilter,
  sortMode,
  staleAgeHours,
  staleAgeSaving,
  autoApproveEnabled,
  autoApproveSaving,
  batchRerunning,
  batchMode,
  batchProgress,
  visiblePageCount,
  staleCount,
  displayedCount,
  totalCount,
  onQueueFilterChange,
  onSortModeChange,
  onStaleAgeChange,
  onStaleAgeSave,
  onToggleAutoApprove,
  onRerunVisible,
  onRerunStale,
}: ReviewQueueControlsProps): JSX.Element {
  return (
    <section className="flex flex-col gap-1.5" aria-label="Review queue controls">
      <WorkbenchFilterTabs
        ariaLabel="Review queue filters"
        className={reviewQueueLaneGridClass()}
        options={[
          { value: "all", label: "All", count: totalCount, title: "All review decisions" },
          ...lanes.map((lane) => ({
            value: lane.key,
            label: reviewQueueCompactLaneLabel(lane.key),
            count: counts[lane.key],
            title: lane.description,
          })),
        ]}
        value={queueFilter}
        onValueChange={onQueueFilterChange}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <ActionButton
          type="button"
          onClick={onToggleAutoApprove}
          loading={autoApproveSaving}
          tone={autoApproveEnabled ? "secondary" : "quiet"}
          className={`min-h-7 px-2.5 py-1 ${
            autoApproveEnabled
              ? "border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft)_/_0.58)] text-[rgb(var(--app-success))] hover:bg-[rgb(var(--app-success-soft))]"
              : "text-[rgb(var(--app-text-muted))]"
          }`}
          title={autoApproveEnabled ? "Disable auto-approve" : "Enable auto-approve"}
          aria-label={autoApproveEnabled ? "Disable auto-approve" : "Enable auto-approve"}
          aria-pressed={autoApproveEnabled}
        >
          Auto: {autoApproveEnabled ? "On" : "Off"}
        </ActionButton>
        <select
          className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1 text-xs text-[rgb(var(--app-text-muted))] outline-none focus:border-[rgb(var(--app-border-strong))]"
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value === "recent" ? "recent" : "attention")}
          aria-label="Sort review queue"
        >
          <option value="attention">Needs attention first</option>
          <option value="recent">Most recent first</option>
        </select>
        <label className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))]">
          Stale
          <input
            type="number"
            min={1}
            value={staleAgeHours}
            disabled={staleAgeSaving}
            onChange={(e) => {
              const next = Number(e.target.value);
              onStaleAgeChange(Number.isFinite(next) && next > 0 ? next : 1);
            }}
            onBlur={(e) => onStaleAgeSave(Number(e.target.value))}
            className="w-12 bg-transparent text-right text-[rgb(var(--app-text))] outline-none disabled:opacity-60"
            aria-label="Stale review age in hours"
          />
          h
        </label>
        <ActionButton
          type="button"
          onClick={onRerunVisible}
          disabled={visiblePageCount === 0 || (batchRerunning && batchMode !== "visible")}
          loading={batchRerunning && batchMode === "visible"}
          className="min-h-7 px-2.5 py-1"
        >
          {batchRerunning && batchProgress && batchMode === "visible"
            ? `Rerun visible ${batchProgress.done}/${batchProgress.total}`
            : "Rerun page"}
        </ActionButton>
        <ActionButton
          type="button"
          onClick={onRerunStale}
          disabled={staleCount === 0 || (batchRerunning && batchMode !== "stale")}
          loading={batchRerunning && batchMode === "stale"}
          className="min-h-7 border-[rgb(var(--app-warning))]/35 px-2.5 py-1 text-[rgb(var(--app-warning))] hover:bg-[rgb(var(--app-warning)_/_0.10)]"
        >
          {batchRerunning && batchProgress && batchMode === "stale"
            ? `Rerun stale ${batchProgress.done}/${batchProgress.total}`
            : "Rerun stale"}
          {!(batchRerunning && batchMode === "stale") && staleCount > 0 && (
            <span className="ml-1.5 rounded-full bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {staleCount}
            </span>
          )}
        </ActionButton>
        <span className={reviewQueueFooterCountClass()}>
          {displayedCount}/{totalCount}
        </span>
      </div>
    </section>
  );
}

export function reviewQueueLaneGridClass(): string {
  return "flex min-w-0 flex-wrap items-center gap-1.5";
}

export function reviewQueueFooterCountClass(): string {
  return "rounded-md border border-transparent px-1.5 py-1 text-xs text-[rgb(var(--app-text-subtle))] sm:ml-auto sm:w-auto sm:text-right";
}

export function reviewQueueCompactLaneLabel(key: ReviewQueueItem["decisionQueue"]): string {
  if (key === "auto_approved") return "Auto";
  if (key === "needs_human_review") return "Human";
  if (key === "blocked") return "Blocked";
  return "Watch";
}
