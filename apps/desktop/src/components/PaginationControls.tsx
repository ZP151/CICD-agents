export interface PaginationControlsProps {
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  visibleItems: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(page, 1), Math.max(pageCount, 1));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): {
  pageItems: T[];
  pageCount: number;
  pageStart: number;
  pageEnd: number;
} {
  const normalizedPageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(items.length / normalizedPageSize));
  const currentPage = clampPage(page, pageCount);
  const startIndex = (currentPage - 1) * normalizedPageSize;
  const pageItems = items.slice(startIndex, startIndex + normalizedPageSize);
  return {
    pageItems,
    pageCount,
    pageStart: items.length === 0 ? 0 : startIndex + 1,
    pageEnd: startIndex + pageItems.length,
  };
}

export function PaginationControls({
  page,
  pageCount,
  pageSize,
  totalItems,
  visibleItems,
  itemLabel,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
}: PaginationControlsProps): JSX.Element | null {
  if (totalItems === 0) return null;

  const currentPage = clampPage(page, pageCount);
  const normalizedOptions = Array.from(new Set(
    [
      ...pageSizeOptions.filter((option) => option > 0 && option < totalItems),
      totalItems,
    ].filter((option) => option > 0),
  )).sort((a, b) => a - b);
  const displayedPageSize = normalizedOptions.includes(pageSize) ? pageSize : totalItems;
  const showPageSize = normalizedOptions.length > 1;
  const showPageStepper = pageCount > 1;
  if (!showPageSize && !showPageStepper) return null;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(start + visibleItems - 1, totalItems);

  return (
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[rgb(var(--app-border))] pt-3">
      <p className="text-xs text-[rgb(var(--app-text-muted))]">
        Showing <span className="text-[rgb(var(--app-text))]">{start}-{end}</span> of{" "}
        <span className="text-[rgb(var(--app-text))]">{totalItems}</span> {itemLabel}
      </p>
      {(showPageSize || showPageStepper) && (
      <div className="flex flex-wrap items-center gap-2">
        {showPageSize && (
        <label className="inline-flex items-center gap-1.5 text-xs text-[rgb(var(--app-text-subtle))]">
          Page size
          <WorkbenchSelect
            value={displayedPageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="min-h-7 w-auto px-2 py-1 text-xs text-[rgb(var(--app-text-muted))]"
            aria-label={`${itemLabel} page size`}
          >
            {normalizedOptions.map((option) => (
              <option key={option} value={option}>{option === totalItems ? "All" : option}</option>
            ))}
          </WorkbenchSelect>
        </label>
        )}
        {showPageStepper && (
        <div className="inline-flex items-center gap-1">
          <ActionButton
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            title={`Previous ${itemLabel} page`}
            aria-label={`Previous ${itemLabel} page`}
            tone="quiet"
            className="h-7 min-h-7 w-7 px-0"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 6l-6 6 6 6" />
            </svg>
          </ActionButton>
          <span className="min-w-16 text-center text-xs text-[rgb(var(--app-text-subtle))]">
            {currentPage} / {pageCount}
          </span>
          <ActionButton
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => onPageChange(currentPage + 1)}
            title={`Next ${itemLabel} page`}
            aria-label={`Next ${itemLabel} page`}
            tone="quiet"
            className="h-7 min-h-7 w-7 px-0"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6l6 6-6 6" />
            </svg>
          </ActionButton>
        </div>
        )}
      </div>
      )}
    </div>
  );
}
import { ActionButton, WorkbenchSelect } from "./workbench/WorkbenchPrimitives.js";
