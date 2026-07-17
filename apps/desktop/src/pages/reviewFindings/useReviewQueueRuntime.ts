import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchProjectLinkReviewQueue,
  type ReviewFinding,
  type ReviewQueueItem,
  type ProjectLink,
} from "../../api.js";
import { loadFindingsLocal } from "../../reviewHistoryLocal.js";
import { replaceReviewQueueItem, replaceSelectedReviewQueueItem } from "./reviewQueueRuntime.js";
import { useReviewQueueActions } from "./useReviewQueueActions.js";
import { useReviewQueueBatchRerun } from "./useReviewQueueBatchRerun.js";
import { useReviewOperationActivity } from "./useReviewOperationActivity.js";
import { useReviewQueueSettings } from "./useReviewQueueSettings.js";
import { useReviewQueueView } from "./useReviewQueueView.js";
import { projectLinkReviewQueueCacheKey } from "./reviewQueueViewModel.js";

export interface ReviewQueueRuntimeInput {
  projectLinkId: string;
  selectedProjectLink: ProjectLink | null;
}

export function useReviewQueueRuntime({
  projectLinkId,
  selectedProjectLink,
}: ReviewQueueRuntimeInput) {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [itemsProjectLinkId, setItemsProjectLinkId] = useState(projectLinkId);
  const [itemsScopeKey, setItemsScopeKey] = useState("");
  const [configured, setConfigured] = useState(true);
  const [storage, setStorage] = useState<"azure" | "local" | "browser" | undefined>();
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [panelFindings, setPanelFindings] = useState<ReviewFinding[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [queueFilter, setQueueFilter] = useState<ReviewQueueItem["decisionQueue"] | "all">("all");
  const [sortMode, setSortMode] = useState<"attention" | "recent">("attention");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const settings = useReviewQueueSettings();
  const reviewQueueScopeKey = useMemo(
    () => projectLinkReviewQueueCacheKey(selectedProjectLink, projectLinkId),
    [projectLinkId, selectedProjectLink],
  );
  const activity = useReviewOperationActivity(projectLinkId, reviewQueueScopeKey);

  useEffect(() => {
    setSelectedItem(null);
    setPanelFindings([]);
    setActionError(null);
    setConfigured(true);
    setStorage(undefined);
    setStorageWarning(null);
  }, [projectLinkId, reviewQueueScopeKey]);

  const reviewQueueQuery = useQuery({
    queryKey: ["reviewQueue", projectLinkId, reviewQueueScopeKey],
    enabled: Boolean(projectLinkId),
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      if (!Array.isArray(previousKey)) return undefined;
      return previousKey[1] === projectLinkId && previousKey[2] === reviewQueueScopeKey
        ? previous
        : undefined;
    },
    retry: false,
    retryOnMount: false,
    queryFn: () => fetchProjectLinkReviewQueue(projectLinkId),
  });

  useEffect(() => {
    if (!reviewQueueQuery.data) return;
    setItems(reviewQueueQuery.data.items);
    setItemsProjectLinkId(projectLinkId);
    setItemsScopeKey(reviewQueueScopeKey);
    setConfigured(reviewQueueQuery.data.configured);
    setStorage(reviewQueueQuery.data.storage);
    setStorageWarning(reviewQueueQuery.data.warning ?? null);
  }, [projectLinkId, reviewQueueQuery.data, reviewQueueScopeKey]);

  const load = useCallback(async () => {
    await reviewQueueQuery.refetch();
  }, [reviewQueueQuery]);

  const scopedItems =
    itemsProjectLinkId === projectLinkId && itemsScopeKey === reviewQueueScopeKey && items.length > 0
      ? items
      : reviewQueueQuery.data?.items ?? [];
  const loading = reviewQueueQuery.isLoading && scopedItems.length === 0;
  const refreshing = reviewQueueQuery.isFetching && scopedItems.length > 0;
  const queryError =
    reviewQueueQuery.error instanceof Error ? reviewQueueQuery.error.message : null;
  const error = actionError ?? queryError;

  const { counts, displayedItems, staleDisplayedItems, paginatedItems } = useReviewQueueView({
    items: scopedItems,
    projectLinkId,
    queueFilter,
    sortMode,
    page,
    pageSize,
    staleAgeHours: settings.staleAgeHours,
    setPage,
  });

  function openFindings(item: ReviewQueueItem): void {
    setPanelFindings(loadFindingsLocal(item.repository, item.pullRequestId, projectLinkId));
    setSelectedItem(item);
  }

  function closePanel(): void {
    setSelectedItem(null);
    setPanelFindings([]);
  }

  function replaceItem(source: ReviewQueueItem, next: ReviewQueueItem): void {
    setItems((prev) => replaceReviewQueueItem(prev, source, next));
    setSelectedItem((current) => replaceSelectedReviewQueueItem(current, source, next));
  }

  const actions = useReviewQueueActions({
    projectLinkId,
    selectedProjectLink,
    selectedItem,
    setError: setActionError,
    load,
    replaceItem,
    setPanelFindings,
    recordOperation: activity.recordOperation,
  });

  const batch = useReviewQueueBatchRerun({
    projectLinkId,
    repositoryName: selectedProjectLink?.adoRepoName || "visible queue",
    rerunning: actions.rerunning,
    rerunReview: actions.rerunReview,
    recordOperation: activity.recordOperation,
  });

  const cachedQueue = reviewQueueQuery.data;

  return {
    items: scopedItems,
    configured: cachedQueue ? cachedQueue.configured : configured,
    storage: cachedQueue?.storage ?? storage,
    storageWarning: cachedQueue?.warning ?? storageWarning,
    loading,
    refreshing,
    error,
    selectedItem,
    panelFindings,
    autoApproveEnabled: settings.autoApproveEnabled,
    autoApproveSaving: settings.autoApproveSaving,
    autoApproveError: settings.autoApproveError,
    staleAgeHours: settings.staleAgeHours,
    staleAgeSaving: settings.staleAgeSaving,
    queueFilter,
    sortMode,
    page,
    pageSize,
    writeBackRetrying: actions.writeBackRetrying,
    rerunning: actions.rerunning,
    dispositionSaving: actions.dispositionSaving,
    batchRerunning: batch.batchRerunning,
    batchProgress: batch.batchProgress,
    batchMode: batch.batchMode,
    operationEvents: activity.operationEvents,
    activityFilter: activity.activityFilter,
    counts,
    displayedItems,
    staleDisplayedItems,
    paginatedItems,
    filteredOperationEvents: activity.filteredOperationEvents,
    setStaleAgeHours: settings.setStaleAgeHours,
    setQueueFilter,
    setSortMode,
    setPage,
    setPageSize,
    setActivityFilter: activity.setActivityFilter,
    load,
    openFindings,
    closePanel,
    setGlobalAutoApprove: settings.setGlobalAutoApprove,
    saveStaleAgeHours: settings.saveStaleAgeHours,
    applyDisposition: actions.applyDisposition,
    retryDispositionWriteBack: actions.retryDispositionWriteBack,
    rerunReview: actions.rerunReview,
    rerunVisibleReviews: () => batch.rerunReviewItems(paginatedItems.pageItems, "visible"),
    rerunStaleReviews: () => batch.rerunReviewItems(staleDisplayedItems, "stale"),
  };
}
