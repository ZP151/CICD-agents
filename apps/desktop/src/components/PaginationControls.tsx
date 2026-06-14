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
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800/70 bg-zinc-900/20 px-3 py-2">
      <p className="text-xs text-zinc-500">
        Showing <span className="text-zinc-300">{start}-{end}</span> of{" "}
        <span className="text-zinc-300">{totalItems}</span> {itemLabel}
      </p>
      {(showPageSize || showPageStepper) && (
      <div className="flex flex-wrap items-center gap-2">
        {showPageSize && (
        <label className="inline-flex items-center gap-1.5 text-xs text-zinc-600">
          Page size
          <select
            value={displayedPageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 outline-none transition focus:border-zinc-600"
            aria-label={`${itemLabel} page size`}
          >
            {normalizedOptions.map((option) => (
              <option key={option} value={option}>{option === totalItems ? "All" : option}</option>
            ))}
          </select>
        </label>
        )}
        {showPageStepper && (
        <div className="inline-flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Previous
          </button>
          <span className="min-w-16 text-center text-xs text-zinc-600">
            {currentPage} / {pageCount}
          </span>
          <button
            type="button"
            disabled={currentPage >= pageCount}
            onClick={() => onPageChange(currentPage + 1)}
            className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
        )}
      </div>
      )}
    </div>
  );
}
