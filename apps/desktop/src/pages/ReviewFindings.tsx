import { useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import { PaginationControls } from "../components/PaginationControls.js";
import {
  loadStoredActiveProjectLinkId,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
} from "../projectLinks.js";
import { FindingsPanel } from "./reviewFindings/FindingsPanel.js";
import { ReviewActivityRail } from "./reviewFindings/ReviewActivityRail.js";
import { ReviewQueueCard } from "./reviewFindings/ReviewQueueCard.js";
import { ReviewQueueControls } from "./reviewFindings/ReviewQueueControls.js";
import { ReviewQueuePageHeader } from "./reviewFindings/ReviewQueuePageHeader.js";
import { useReviewQueueRuntime } from "./reviewFindings/useReviewQueueRuntime.js";

export default function ReviewFindings(): JSX.Element {
  const { projectLinks, projectLinksLoading } = useAppData();
  const [projectLinkId, setProjectLinkId] = useState(() => loadStoredActiveProjectLinkId());

  useEffect(() => {
    if (projectLinks.length === 0) return;
    setProjectLinkId((current) => resolveActiveProjectLinkId(projectLinks, current));
  }, [projectLinks]);

  useEffect(() => {
    saveStoredActiveProjectLinkId(projectLinkId);
  }, [projectLinkId]);

  const selectedProjectLink = useMemo(
    () => projectLinks.find((projectLink) => projectLink.id === projectLinkId) ?? null,
    [projectLinks, projectLinkId],
  );

  const reviewQueue = useReviewQueueRuntime({ projectLinkId, selectedProjectLink });
  const {
    items,
    configured,
    storage,
    loading,
    error,
    selectedItem,
    panelFindings,
    autoApproveEnabled,
    autoApproveSaving,
    autoApproveError,
    staleAgeHours,
    staleAgeSaving,
    queueFilter,
    sortMode,
    page,
    pageSize,
    writeBackRetrying,
    rerunning,
    dispositionSaving,
    batchRerunning,
    batchProgress,
    batchMode,
    operationEvents,
    activityFilter,
    counts,
    displayedItems,
    staleDisplayedItems,
    paginatedItems,
    filteredOperationEvents,
    setStaleAgeHours,
    setQueueFilter,
    setSortMode,
    setPage,
    setPageSize,
    setActivityFilter,
    load,
    openFindings,
    closePanel,
    setGlobalAutoApprove,
    saveStaleAgeHours,
    applyDisposition,
    retryDispositionWriteBack,
    rerunReview,
    rerunVisibleReviews,
    rerunStaleReviews,
  } = reviewQueue;

  return (
    <div className="flex min-h-full w-full flex-col gap-6">
      {selectedItem && (
        <FindingsPanel item={selectedItem} findings={panelFindings} onClose={closePanel} />
      )}

      <ReviewQueuePageHeader
        projectLinks={projectLinks}
        projectLinksLoading={projectLinksLoading}
        projectLinkId={projectLinkId}
        selectedProjectLink={selectedProjectLink}
        onProjectLinkChange={setProjectLinkId}
        onRefresh={() => void load()}
      />

      {!configured && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-500">
          Azure Table Storage is not configured. Review history is stored on this device
          {storage === "browser"
            ? " (browser)"
            : storage === "local"
              ? " and in the daemon data folder"
              : ""}
          .
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {autoApproveError && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
          {autoApproveError}
        </div>
      )}

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <ReviewQueueControls
            counts={counts}
            queueFilter={queueFilter}
            sortMode={sortMode}
            staleAgeHours={staleAgeHours}
            staleAgeSaving={staleAgeSaving}
            autoApproveEnabled={autoApproveEnabled}
            autoApproveSaving={autoApproveSaving}
            batchRerunning={batchRerunning}
            batchMode={batchMode}
            batchProgress={batchProgress}
            visiblePageCount={paginatedItems.pageItems.length}
            staleCount={staleDisplayedItems.length}
            displayedCount={displayedItems.length}
            totalCount={items.length}
            onQueueFilterChange={setQueueFilter}
            onSortModeChange={setSortMode}
            onStaleAgeChange={setStaleAgeHours}
            onStaleAgeSave={(value) => void saveStaleAgeHours(value)}
            onToggleAutoApprove={() => void setGlobalAutoApprove(!autoApproveEnabled)}
            onRerunVisible={() => void rerunVisibleReviews()}
            onRerunStale={() => void rerunStaleReviews()}
          />

          {loading && <p className="text-sm text-zinc-600">Loading review decisions...</p>}

          {!loading && items.length === 0 && (
            <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-8 text-center">
              <p className="text-sm font-medium text-zinc-400">No review decisions found</p>
              <p className="mt-1 text-sm text-zinc-600">
                The Review Agent has not written history for this repository yet.
              </p>
            </div>
          )}

          {items.length > 0 && (
            <section className="flex flex-1 flex-col gap-3">
              {paginatedItems.pageItems.map((item) => (
                <ReviewQueueCard
                  key={`${item.repository}-${item.pullRequestId}`}
                  item={item}
                  staleAgeHours={staleAgeHours}
                  writeBackRetrying={writeBackRetrying}
                  rerunning={rerunning}
                  dispositionSaving={dispositionSaving}
                  onOpenFindings={openFindings}
                  onRerunReview={(target) => void rerunReview(target)}
                  onRetryDispositionWriteBack={(target) => void retryDispositionWriteBack(target)}
                  onApplyDisposition={(target, disposition) =>
                    void applyDisposition(target, disposition)
                  }
                />
              ))}
              {displayedItems.length === 0 && (
                <div className="rounded-lg border border-zinc-800/70 bg-zinc-900/20 p-6 text-center">
                  <p className="text-sm text-zinc-500">
                    No review decisions match this queue filter.
                  </p>
                </div>
              )}
              <PaginationControls
                page={page}
                pageCount={paginatedItems.pageCount}
                pageSize={pageSize}
                totalItems={displayedItems.length}
                visibleItems={paginatedItems.pageItems.length}
                itemLabel="review decisions"
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                }}
              />
            </section>
          )}
        </div>
        <ReviewActivityRail
          events={filteredOperationEvents}
          totalCount={operationEvents.length}
          filter={activityFilter}
          onFilterChange={setActivityFilter}
        />
      </div>
    </div>
  );
}
