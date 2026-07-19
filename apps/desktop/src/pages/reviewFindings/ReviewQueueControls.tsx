import type { ReviewQueueItem } from "../../api.js";
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
      <div className={reviewQueueLaneGridClass()} aria-label="Review queue filters">
        <button
          type="button"
          onClick={() => onQueueFilterChange("all")}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] transition ${
            queueFilter === "all"
              ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))] ring-2 ring-[rgb(var(--app-accent))]/15"
              : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          }`}
          title="All review decisions"
        >
          All
          <span className="rounded-full bg-[rgb(var(--app-surface-raised))] px-1.5 text-[10px] font-semibold text-[rgb(var(--app-text-muted))]">
            {totalCount}
          </span>
        </button>
        {lanes.map((lane) => (
          <button
            key={lane.key}
            type="button"
            onClick={() => onQueueFilterChange(lane.key)}
            aria-pressed={queueFilter === lane.key}
            title={lane.description}
            className={`inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-left text-[11px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 ${
              queueFilter === lane.key
                ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))] ring-2 ring-[rgb(var(--app-accent))]/15"
                : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
            }`}
          >
            <span className="min-w-0 truncate font-medium">{reviewQueueCompactLaneLabel(lane.key)}</span>
            <span className="shrink-0 rounded-full bg-[rgb(var(--app-surface-raised))] px-1.5 text-[10px] font-semibold text-[rgb(var(--app-text-muted))]">
              {counts[lane.key]}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleAutoApprove}
          disabled={autoApproveSaving}
          className={`rounded-md border px-2.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-50 ${
            autoApproveEnabled
              ? "border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft)_/_0.58)] text-[rgb(var(--app-success))] hover:bg-[rgb(var(--app-success-soft))]"
              : "border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          }`}
          title={autoApproveEnabled ? "Disable auto-approve" : "Enable auto-approve"}
          aria-label={autoApproveEnabled ? "Disable auto-approve" : "Enable auto-approve"}
          aria-pressed={autoApproveEnabled}
        >
          Auto: {autoApproveEnabled ? "On" : "Off"}
        </button>
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
        <button
          type="button"
          disabled={batchRerunning || visiblePageCount === 0}
          onClick={onRerunVisible}
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {batchRerunning && batchProgress && batchMode === "visible"
            ? `Rerun visible ${batchProgress.done}/${batchProgress.total}`
            : "Rerun page"}
        </button>
        <button
          type="button"
          disabled={batchRerunning || staleCount === 0}
          onClick={onRerunStale}
          className="rounded-md border border-[rgb(var(--app-warning))]/35 px-2.5 py-1 text-xs text-[rgb(var(--app-warning))] transition hover:bg-[rgb(var(--app-warning)_/_0.10)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {batchRerunning && batchProgress && batchMode === "stale"
            ? `Rerun stale ${batchProgress.done}/${batchProgress.total}`
            : "Rerun stale"}
          {!(batchRerunning && batchMode === "stale") && staleCount > 0 && (
            <span className="ml-1.5 rounded-full bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
              {staleCount}
            </span>
          )}
        </button>
        <span className={reviewQueueFooterCountClass()}>
          {displayedCount}/{totalCount}
        </span>
      </div>
    </section>
  );
}

export function reviewQueueLaneGridClass(): string {
  return "flex flex-wrap gap-1.5";
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
