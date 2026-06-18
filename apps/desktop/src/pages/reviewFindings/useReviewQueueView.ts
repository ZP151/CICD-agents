import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import { paginateItems } from "../../components/PaginationControls.js";
import type { ReviewQueueItem } from "../../api.js";
import { compareReviewQueueItems } from "../../reviewHistoryLocal.js";
import { staleReviewQueueItems } from "../../reviewRunHistory.js";

export interface ReviewQueueViewArgs {
  items: ReviewQueueItem[];
  projectLinkId: string;
  queueFilter: ReviewQueueItem["decisionQueue"] | "all";
  sortMode: "attention" | "recent";
  page: number;
  pageSize: number;
  staleAgeHours: number;
  setPage: Dispatch<SetStateAction<number>>;
}

export function useReviewQueueView({
  items,
  page,
  pageSize,
  projectLinkId,
  queueFilter,
  setPage,
  sortMode,
  staleAgeHours,
}: ReviewQueueViewArgs) {
  const counts = useMemo(() => {
    return items.reduce<Record<ReviewQueueItem["decisionQueue"], number>>(
      (acc, item) => {
        acc[item.decisionQueue] += 1;
        return acc;
      },
      { auto_approved: 0, needs_human_review: 0, blocked: 0, watching: 0 },
    );
  }, [items]);

  const displayedItems = useMemo(() => {
    const filtered =
      queueFilter === "all" ? items : items.filter((item) => item.decisionQueue === queueFilter);
    return [...filtered].sort((a, b) => {
      if (sortMode === "recent") {
        return Date.parse(b.lastRunAt || "0") - Date.parse(a.lastRunAt || "0");
      }
      return compareReviewQueueItems(a, b);
    });
  }, [items, queueFilter, sortMode]);

  const staleDisplayedItems = useMemo(
    () => staleReviewQueueItems(displayedItems, Date.now(), staleAgeHours),
    [displayedItems, staleAgeHours],
  );

  const paginatedItems = useMemo(
    () => paginateItems(displayedItems, page, pageSize),
    [displayedItems, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [projectLinkId, queueFilter, setPage, sortMode]);

  useEffect(() => {
    if (page > paginatedItems.pageCount) setPage(paginatedItems.pageCount);
  }, [page, paginatedItems.pageCount, setPage]);

  return {
    counts,
    displayedItems,
    staleDisplayedItems,
    paginatedItems,
  };
}
