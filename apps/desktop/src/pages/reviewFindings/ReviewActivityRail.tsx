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
    <aside className="fixed inset-y-0 right-0 z-40 min-w-0 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto border-l border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-xl xl:sticky xl:top-4 xl:h-auto xl:w-auto xl:rounded-lg xl:border xl:shadow-none xl:self-start">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-[rgb(var(--app-text))]">Recent activity</p>
          <span className="text-[11px] text-[rgb(var(--app-text-subtle))]">{totalCount} latest</span>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:text-[rgb(var(--app-text))]"
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
                ? "border border-[rgb(var(--app-accent))]/45 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))]"
                : "border border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:text-[rgb(var(--app-text))]"
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>
      {events.length === 0 ? (
        <p className="mt-4 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          No activity in this category yet.
        </p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2.5 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ring-1 ${
                  event.ok
                    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300"
                    : "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-300"
                }`}>
                  {operationKindLabel(event.kind)}
                </span>
                <span className="shrink-0 text-[10px] text-[rgb(var(--app-text-subtle))]">{formatDate(event.at)}</span>
              </div>
              <p className="mt-1.5 truncate text-[rgb(var(--app-text-muted))]" title={event.label}>
                <span className="font-mono text-[rgb(var(--app-text-subtle))]">
                  {event.pullRequestId > 0 ? `#${event.pullRequestId}` : event.repository}
                </span>
                <span className="ml-1.5">{event.label}</span>
              </p>
              {event.details && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[rgb(var(--app-text-subtle))]" title={event.details}>
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
