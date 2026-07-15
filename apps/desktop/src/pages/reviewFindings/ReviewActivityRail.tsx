import type { ReviewOperationEvent } from "../../reviewOperations.js";
import {
  activityCategories,
  formatDate,
  operationKindLabel,
  type ActivityCategory,
} from "./reviewQueueViewModel.js";

export function ReviewActivityRail({
  events,
  totalCount,
  filter,
  open,
  onFilterChange,
  onOpenChange,
}: {
  events: ReviewOperationEvent[];
  totalCount: number;
  filter: ActivityCategory;
  open: boolean;
  onFilterChange: (filter: ActivityCategory) => void;
  onOpenChange: (open: boolean) => void;
}): JSX.Element {
  if (!open) {
    return (
      <aside className="flex justify-end xl:sticky xl:top-4 xl:self-start">
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:text-[rgb(var(--app-text))]"
        >
          Show activity
        </button>
      </aside>
    );
  }

  return (
    <aside className="min-w-0 rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-3 xl:sticky xl:top-4 xl:self-start">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-zinc-400">Recent activity</p>
          <span className="text-[11px] text-zinc-700">{totalCount} latest</span>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-md border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
        >
          Hide
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {activityCategories.map((category) => (
          <button
            key={category.key}
            type="button"
            onClick={() => onFilterChange(category.key)}
            className={`rounded-md px-2 py-1 text-[11px] transition ${
              filter === category.key
                ? "border border-zinc-700 bg-zinc-800/60 text-zinc-200"
                : "border border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>
      {events.length === 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-zinc-600">
          No activity in this category yet.
        </p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-md border border-zinc-800/70 bg-zinc-950/30 px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${
                  event.ok
                    ? "bg-emerald-950/20 text-emerald-500/80 ring-emerald-900/40"
                    : "bg-yellow-950/30 text-yellow-400 ring-yellow-900/60"
                }`}>
                  {operationKindLabel(event.kind)}
                </span>
                <span className="shrink-0 text-[10px] text-zinc-700">{formatDate(event.at)}</span>
              </div>
              <p className="mt-1.5 truncate text-zinc-400" title={event.label}>
                <span className="font-mono text-zinc-600">
                  {event.pullRequestId > 0 ? `#${event.pullRequestId}` : event.repository}
                </span>
                <span className="ml-1.5">{event.label}</span>
              </p>
              {event.details && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-600" title={event.details}>
                  {event.details}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
