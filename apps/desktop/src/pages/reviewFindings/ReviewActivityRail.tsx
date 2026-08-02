import type { ReviewOperationEvent } from "../../reviewOperations.js";
import {
  activityCategories,
  formatDate,
  operationKindLabel,
  type ActivityCategory,
} from "./reviewQueueViewModel.js";
import {
  ActionButton,
  StatusBadge,
  WorkbenchFilterTabs,
  WorkbenchSidePanel,
} from "../../components/workbench/WorkbenchPrimitives.js";

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
        <ActionButton
          type="button"
          onClick={() => onOpenChange(true)}
          className="pointer-events-auto min-h-8 gap-1.5 border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 text-[rgb(var(--app-text-muted))] shadow-lg hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))]"
          aria-label="Show activity"
        >
          <ActivityIcon />
          Activity
        </ActionButton>
      </aside>
    );
  }

  return (
    <WorkbenchSidePanel
      open
      onOpenChange={onOpenChange}
      title="Recent activity"
      description={`${totalCount} latest review operations`}
    >
      <WorkbenchFilterTabs
        ariaLabel="Recent activity categories"
        options={activityCategories.map((category) => ({
          value: category.key,
          label: category.label,
        }))}
        value={filter}
        onValueChange={onFilterChange}
      />
        {events.length === 0 ? (
          <p className="mt-4 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
            No activity in this category yet.
          </p>
        ) : (
          <ol className="mt-3 grid gap-2">
            {events.map((event) => (
              <li key={event.id} className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2.5 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge tone={event.ok ? "success" : "warning"}>
                    {operationKindLabel(event.kind)}
                  </StatusBadge>
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
    </WorkbenchSidePanel>
  );
}

export function reviewActivityRailCollapsedClass(): string {
  return "pointer-events-none fixed right-4 top-16 z-30";
}

function ActivityIcon(): JSX.Element {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3" />
    </svg>
  );
}
