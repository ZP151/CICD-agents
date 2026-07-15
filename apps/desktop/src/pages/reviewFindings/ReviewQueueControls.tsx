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
    <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-3">
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
                ? `${lane.tone} ring-2 ring-[rgb(var(--app-accent))]/35`
                : lane.tone
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p className={`text-sm font-semibold ${queueFilter === lane.key ? "text-[rgb(var(--app-text))]" : ""}`}>{lane.title}</p>
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
                      ? "border-emerald-800/60 bg-emerald-900/40 text-emerald-300"
                      : "border-zinc-700 bg-zinc-800/40 text-zinc-500 hover:text-zinc-300"
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
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">{lane.description}</p>
            <div className="mt-4 flex items-end justify-between gap-2">
              <p className="text-2xl font-semibold text-zinc-200">{counts[lane.key]}</p>
              {lane.key === "auto_approved" && (
                <p className="text-[10px] font-medium text-zinc-600">
                  {autoApproveEnabled ? "Enabled" : "Disabled"}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-800/70 pt-3">
        <button
          type="button"
          onClick={() => onQueueFilterChange("all")}
          className={`rounded-md px-2.5 py-1 text-xs transition ${
            queueFilter === "all"
              ? "border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text))]"
              : "border border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
          }`}
        >
          All
        </button>
        <select
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-400 outline-none"
          value={sortMode}
          onChange={(e) => onSortModeChange(e.target.value === "recent" ? "recent" : "attention")}
          aria-label="Sort review queue"
        >
          <option value="attention">Needs attention first</option>
          <option value="recent">Most recent first</option>
        </select>
        <label className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-500">
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
            className="w-12 bg-transparent text-right text-zinc-300 outline-none disabled:opacity-60"
            aria-label="Stale review age in hours"
          />
          h
        </label>
        <button
          type="button"
          disabled={batchRerunning || visiblePageCount === 0}
          onClick={onRerunVisible}
          className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {batchRerunning && batchProgress && batchMode === "visible"
            ? `Rerun visible ${batchProgress.done}/${batchProgress.total}`
            : "Rerun page"}
        </button>
        <button
          type="button"
          disabled={batchRerunning || staleCount === 0}
          onClick={onRerunStale}
          className="rounded-md border border-yellow-900/50 px-2.5 py-1 text-xs text-yellow-400/80 transition hover:border-yellow-700 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {batchRerunning && batchProgress && batchMode === "stale"
            ? `Rerun stale ${batchProgress.done}/${batchProgress.total}`
            : "Rerun stale"}
          {!(batchRerunning && batchMode === "stale") && staleCount > 0 && (
            <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
              {staleCount}
            </span>
          )}
        </button>
        <span className="ml-auto text-xs text-zinc-600">
          {displayedCount} visible from {totalCount} decisions
        </span>
      </div>
    </section>
  );
}
