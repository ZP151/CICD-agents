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
  const [activityRailOpen, setActivityRailOpen] = useState(
    () => localStorage.getItem("mergepilot_review_activity_panel_open") !== "false",
  );

  useEffect(() => {
    if (projectLinks.length === 0) return;
    setProjectLinkId((current) => resolveActiveProjectLinkId(projectLinks, current));
  }, [projectLinks]);

  useEffect(() => {
    saveStoredActiveProjectLinkId(projectLinkId);
  }, [projectLinkId]);

  useEffect(() => {
    localStorage.setItem("mergepilot_review_activity_panel_open", String(activityRailOpen));
  }, [activityRailOpen]);

  const selectedProjectLink = useMemo(
    () => projectLinks.find((projectLink) => projectLink.id === projectLinkId) ?? null,
    [projectLinks, projectLinkId],
  );

  const reviewQueue = useReviewQueueRuntime({ projectLinkId, selectedProjectLink });
  const projectLinkResolving = projectLinksLoading && projectLinks.length === 0 && !projectLinkId;
  const {
    items,
    configured,
    storage,
    storageWarning,
    loading,
    refreshing,
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
        <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4 text-sm text-[rgb(var(--app-text-muted))]">
          Azure Table Storage is not configured. Review history is stored on this device
          {storage === "browser"
            ? " (browser)"
            : storage === "local"
              ? " and in the daemon data folder"
              : ""}
          .
        </div>
      )}

      {storageWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {storageWarning} Local review history remains available on this device.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {autoApproveError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
          {autoApproveError}
        </div>
      )}

      <div
        className={`grid flex-1 gap-4 ${activityRailOpen ? "xl:grid-cols-[minmax(0,1fr)_19rem]" : "xl:grid-cols-[minmax(0,1fr)_auto]"}`}
      >
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

          {(projectLinkResolving || loading) && <ReviewQueueLoadingSkeleton />}
          {!projectLinkResolving && !loading && refreshing && (
            <p className="text-xs text-[rgb(var(--app-text-subtle))]">
              Refreshing review decisions...
            </p>
          )}

          {!projectLinkResolving && !loading && items.length === 0 && (
            <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-8 text-center">
              <p className="text-sm font-medium text-[rgb(var(--app-text))]">No review decisions found</p>
              <p className="mt-1 text-sm text-[rgb(var(--app-text-muted))]">
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
                  projectLinkId={projectLinkId}
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
                <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-6 text-center">
                  <p className="text-sm text-[rgb(var(--app-text-muted))]">
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
          open={activityRailOpen}
          onFilterChange={setActivityFilter}
          onOpenChange={setActivityRailOpen}
        />
      </div>
    </div>
  );
}

function ReviewQueueLoadingSkeleton(): JSX.Element {
  return (
    <div className="grid gap-3" aria-label="Preparing review queue">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className="h-36 animate-pulse rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]"
          />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
      <div className="h-28 animate-pulse rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
    </div>
  );
}
