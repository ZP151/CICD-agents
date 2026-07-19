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
      <aside className={reviewActivityRailCollapsedClass()}>
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 text-xs text-[rgb(var(--app-text-muted))] shadow-lg transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/30"
          aria-label="Show activity"
          title="Show recent review activity"
        >
          <ActivityIcon />
          Activity
        </button>
      </aside>
    );
  }

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 cursor-default bg-black/5"
        aria-label="Close recent activity"
        onClick={() => onOpenChange(false)}
      />
      <aside className={reviewActivityRailExpandedClass()} role="dialog" aria-label="Recent activity">
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
            Close
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
                      ? "bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success))]/25"
                      : "bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning))]/30"
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
    </>
  );
}

export function reviewActivityRailCollapsedClass(): string {
  return "pointer-events-none fixed right-4 top-16 z-30";
}

export function reviewActivityRailExpandedClass(): string {
  return [
    "fixed inset-y-0 right-0 z-40 min-w-0 w-[min(24rem,calc(100vw-2rem))]",
    "overflow-y-auto border-l border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3 shadow-2xl",
  ].join(" ");
}

function ActivityIcon(): JSX.Element {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3" />
    </svg>
  );
}
