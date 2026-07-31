import { useEffect, useMemo, useState } from "react";
import { useAppData } from "../App.js";
import { PaginationControls } from "../components/PaginationControls.js";
import { WorkbenchPage } from "../components/workbench/WorkbenchPrimitives.js";
import {
  loadStoredActiveProjectLinkId,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
} from "../projectLinks.js";
import { FindingsPanel } from "./reviewFindings/FindingsPanel.js";
import { ReviewActivityRail } from "./reviewFindings/ReviewActivityRail.js";
import { ReviewQueueCard } from "./reviewFindings/ReviewQueueCard.js";
import {
  ReviewQueueControls,
  reviewQueueLaneGridClass,
} from "./reviewFindings/ReviewQueueControls.js";
import { ReviewQueuePageHeader } from "./reviewFindings/ReviewQueuePageHeader.js";
import { useReviewQueueRuntime } from "./reviewFindings/useReviewQueueRuntime.js";

export const REVIEW_ACTIVITY_PANEL_STORAGE_KEY = "mergepilot_review_activity_panel_open_v2";

interface ReviewActivityPanelStorage {
  getItem: (key: string) => string | null;
}

export function reviewQueueWorkspaceLayoutClass(activityRailOpen: boolean): string {
  void activityRailOpen;
  return "flex flex-1 flex-col gap-4";
}

export function reviewQueuePageShellClass(): string {
  return "gap-4";
}

export function reviewQueueSetupChecklistGridClass(): string {
  return "mt-4 grid gap-2 text-xs text-[rgb(var(--app-text-muted))] grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))]";
}

export function reviewQueueLoadingLaneGridClass(): string {
  return reviewQueueLaneGridClass();
}

export function loadStoredReviewActivityPanelOpen(
  storage: ReviewActivityPanelStorage | null | undefined = typeof window !== "undefined"
    ? window.localStorage
    : undefined,
): boolean {
  return storage?.getItem(REVIEW_ACTIVITY_PANEL_STORAGE_KEY) === "true";
}

export default function ReviewFindings(): JSX.Element {
  const { projectLinks, projectLinksLoading } = useAppData();
  const [projectLinkId, setProjectLinkId] = useState(() => loadStoredActiveProjectLinkId());
  const [activityRailOpen, setActivityRailOpen] = useState(() => loadStoredReviewActivityPanelOpen());

  useEffect(() => {
    if (projectLinks.length === 0) return;
    setProjectLinkId((current) => resolveActiveProjectLinkId(projectLinks, current));
  }, [projectLinks]);

  useEffect(() => {
    saveStoredActiveProjectLinkId(projectLinkId);
  }, [projectLinkId]);

  useEffect(() => {
    localStorage.setItem(REVIEW_ACTIVITY_PANEL_STORAGE_KEY, String(activityRailOpen));
  }, [activityRailOpen]);

  const selectedProjectLink = useMemo(
    () => projectLinks.find((projectLink) => projectLink.id === projectLinkId) ?? null,
    [projectLinks, projectLinkId],
  );

  const reviewQueue = useReviewQueueRuntime({ projectLinkId, selectedProjectLink });
  const projectLinkResolving = projectLinksLoading && projectLinks.length === 0 && !projectLinkId;
  const missingProjectLink = !projectLinksLoading && projectLinks.length === 0;
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
    <WorkbenchPage className={reviewQueuePageShellClass()}>
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
        <div className="rounded-lg border border-[rgb(var(--app-warning))]/30 bg-[rgb(var(--app-warning)_/_0.10)] px-4 py-3 text-sm text-[rgb(var(--app-warning))]">
          {storageWarning} Local review history remains available on this device.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] p-4 text-sm text-[rgb(var(--app-danger))]">
          {error}
        </div>
      )}

      {autoApproveError && (
        <div className="rounded-lg border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] p-4 text-sm text-[rgb(var(--app-danger))]">
          {autoApproveError}
        </div>
      )}

      {missingProjectLink ? (
        <ReviewQueueNoProjectLinkState />
      ) : projectLinkResolving ? (
        <ReviewQueueProjectLinkResolvingState />
      ) : (
        <ReviewActivityRail
          events={filteredOperationEvents}
          totalCount={operationEvents.length}
          filter={activityFilter}
          open={activityRailOpen}
          onFilterChange={setActivityFilter}
          onOpenChange={setActivityRailOpen}
        />
      )}

      {!missingProjectLink && !projectLinkResolving && (
        <div className={reviewQueueWorkspaceLayoutClass(activityRailOpen)}>
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

            {loading && <ReviewQueueLoadingSkeleton />}
            {!loading && refreshing && (
              <p className="text-xs text-[rgb(var(--app-text-subtle))]">
                Refreshing review decisions...
              </p>
            )}

            {!loading && items.length === 0 && (
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
        </div>
      )}
    </WorkbenchPage>
  );
}

export function ReviewQueueProjectLinkResolvingState(): JSX.Element {
  return (
    <section
      className="w-full max-w-5xl rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-5"
      aria-label="Loading Project Links"
    >
      <div className="flex max-w-xl items-center gap-3">
        <span className="h-9 w-9 animate-pulse rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--app-text))]">
            Loading Project Links
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
            Checking repository mappings before loading Review Queue decisions.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ReviewQueueNoProjectLinkState(): JSX.Element {
  return (
    <section className="w-full max-w-5xl rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-6">
      <div className="max-w-2xl">
        <p className="text-sm font-semibold text-[rgb(var(--app-text))]">
          No Project Link available
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
          Create a Project Link with Azure DevOps mapping before reviewing PR decisions,
          approval history, or Review Agent audit records.
        </p>
        <ul className={reviewQueueSetupChecklistGridClass()}>
          <li className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
            Project Link mapping
          </li>
          <li className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
            Azure DevOps PR access
          </li>
          <li className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
            Review Agent history
          </li>
        </ul>
        <a
          href="#/project-links"
          className="mt-4 inline-flex rounded-md border border-[rgb(var(--app-border))] px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
        >
          Open Project Links
        </a>
      </div>
    </section>
  );
}

function ReviewQueueLoadingSkeleton(): JSX.Element {
  return (
    <div className="grid gap-3" aria-label="Preparing review queue">
      <div className={reviewQueueLoadingLaneGridClass()}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            className="h-7 w-32 animate-pulse rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]"
          />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
      <div className="h-28 animate-pulse rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
    </div>
  );
}
