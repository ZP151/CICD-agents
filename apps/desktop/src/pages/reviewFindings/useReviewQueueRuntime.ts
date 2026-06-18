import { useCallback, useEffect, useState } from "react";
import {
  fetchProjectLinkReviewQueue,
  type ReviewFinding,
  type ReviewQueueItem,
  type ProjectLink,
} from "../../api.js";
import {
  loadFindingsLocal,
} from "../../reviewHistoryLocal.js";
import {
  replaceReviewQueueItem,
  replaceSelectedReviewQueueItem,
} from "./reviewQueueRuntime.js";
import { useReviewQueueActions } from "./useReviewQueueActions.js";
import { useReviewQueueBatchRerun } from "./useReviewQueueBatchRerun.js";
import { useReviewOperationActivity } from "./useReviewOperationActivity.js";
import { useReviewQueueSettings } from "./useReviewQueueSettings.js";
import { useReviewQueueView } from "./useReviewQueueView.js";

export interface ReviewQueueRuntimeInput {
  projectLinkId: string;
  selectedProjectLink: ProjectLink | null;
}

export function useReviewQueueRuntime({ projectLinkId, selectedProjectLink }: ReviewQueueRuntimeInput) {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [configured, setConfigured] = useState(true);
  const [storage, setStorage] = useState<"azure" | "local" | "browser" | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ReviewQueueItem | null>(null);
  const [panelFindings, setPanelFindings] = useState<ReviewFinding[]>([]);
  const [queueFilter, setQueueFilter] = useState<ReviewQueueItem["decisionQueue"] | "all">("all");
  const [sortMode, setSortMode] = useState<"attention" | "recent">("attention");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const settings = useReviewQueueSettings();
  const activity = useReviewOperationActivity(projectLinkId);

  const load = useCallback(async () => {
    if (!projectLinkId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchProjectLinkReviewQueue(projectLinkId);
      setItems(result.items);
      setConfigured(result.configured);
      setStorage(result.storage);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectLinkId]);

  useEffect(() => {
    void load();
  }, [load]);

  const {
    counts,
    displayedItems,
    staleDisplayedItems,
    paginatedItems,
  } = useReviewQueueView({
    items,
    projectLinkId,
    queueFilter,
    sortMode,
    page,
    pageSize,
    staleAgeHours: settings.staleAgeHours,
    setPage,
  });

  function openFindings(item: ReviewQueueItem): void {
    setPanelFindings(loadFindingsLocal(item.repository, item.pullRequestId));
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
    setError,
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

  return {
    items,
    configured,
    storage,
    loading,
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
