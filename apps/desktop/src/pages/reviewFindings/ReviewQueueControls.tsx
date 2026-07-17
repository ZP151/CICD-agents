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
    <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {lanes.map((lane) => (
          <div
            key={lane.key}
            role="button"
            tabIndex={0}
            onClick={() => onQueueFilterChange(lane.key)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onQueueFilterChange(lane.key);
              }
            }}
            aria-pressed={queueFilter === lane.key}
            className={`cursor-pointer rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 ${
              queueFilter === lane.key
                ? `${lane.tone} border-[rgb(var(--app-accent))] ring-2 ring-[rgb(var(--app-accent))]/25`
                : lane.tone
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">{lane.title}</p>
              {lane.key === "auto_approved" && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleAutoApprove();
                  }}
                  disabled={autoApproveSaving}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition disabled:opacity-50 ${
                    autoApproveEnabled
                      ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] hover:text-[rgb(var(--app-text))]"
                  }`}
                  title={autoApproveEnabled ? "Disable auto-approve" : "Enable auto-approve"}
                  aria-label={autoApproveEnabled ? "Disable auto-approve" : "Enable auto-approve"}
                  aria-pressed={autoApproveEnabled}
                >
                  {autoApproveEnabled ? (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">{lane.description}</p>
            <div className="mt-4 flex items-end justify-between gap-2">
              <p className="text-2xl font-semibold text-[rgb(var(--app-text))]">{counts[lane.key]}</p>
              {lane.key === "auto_approved" && (
                <p className="text-[10px] font-medium text-[rgb(var(--app-text-subtle))]">
                  {autoApproveEnabled ? "Enabled" : "Disabled"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[rgb(var(--app-border))] pt-3">
        <button
          type="button"
          onClick={() => onQueueFilterChange("all")}
          className={`rounded-md px-2.5 py-1 text-xs transition ${
            queueFilter === "all"
              ? "border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text))]"
              : "border border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          }`}
        >
          All
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
          className="rounded-md border border-amber-500/35 px-2.5 py-1 text-xs text-amber-800 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-300"
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
        <span className="ml-auto text-xs text-[rgb(var(--app-text-subtle))]">
          {displayedCount} visible from {totalCount} decisions
        </span>
      </div>
    </section>
  );
}
