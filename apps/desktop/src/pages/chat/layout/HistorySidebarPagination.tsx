interface HistorySidebarPaginationProps {
  collapsedLimit: number;
  expanded: boolean;
  historyLength: number;
  normalizedPage: number;
  pageCount: number;
  showingEnd: number;
  showingStart: number;
  onExpandedChange: (expanded: boolean) => void;
  onPageChange: (updater: (page: number) => number) => void;
}

export function HistorySidebarPagination({
  collapsedLimit,
  expanded,
  historyLength,
  normalizedPage,
  pageCount,
  showingEnd,
  showingStart,
  onExpandedChange,
  onPageChange,
}: HistorySidebarPaginationProps) {
  if (historyLength <= collapsedLimit) return null;

  const iconButtonClass =
    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[rgb(var(--app-border))] text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mt-auto border-t border-[rgb(var(--app-border))] px-3 py-2">
      {expanded ? (
        <div className="flex flex-col gap-2">
          <p className="text-[10px] text-[rgb(var(--app-text-subtle))]">
            Showing {showingStart}-{showingEnd} of {historyLength}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange((currentPage) => Math.max(1, currentPage - 1))}
              disabled={normalizedPage <= 1}
              title="Previous page"
              aria-label="Previous history page"
              className={iconButtonClass}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 6l-6 6 6 6" />
              </svg>
            </button>
            <span className="min-w-10 text-center text-[11px] text-[rgb(var(--app-text-subtle))]">
              {normalizedPage}/{pageCount}
            </span>
            <button
              type="button"
              onClick={() => onPageChange((currentPage) => Math.min(pageCount, currentPage + 1))}
              disabled={normalizedPage >= pageCount}
              title="Next page"
              aria-label="Next history page"
              className={iconButtonClass}
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6l6 6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                onExpandedChange(false);
                onPageChange(() => 1);
              }}
              className="ml-auto rounded-md px-2 py-1 text-[11px] text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]"
            >
              Show less
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            onExpandedChange(true);
            onPageChange(() => 1);
          }}
          className="w-full rounded-md border border-[rgb(var(--app-border))] px-2 py-1.5 text-left text-[11px] text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]"
        >
          Show more ({historyLength - collapsedLimit} more)
        </button>
      )}
    </div>
  );
}
