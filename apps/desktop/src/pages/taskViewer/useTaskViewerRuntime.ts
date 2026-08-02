import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ACTIVITY_HANDOFF_KEY, handoffProjectLinkId, type ActivityHandoffDraft } from "../../checkpointHandoff.js";
import { prInsightArtifactProjectLinkId } from "../../prInsightArtifacts.js";
import { isTemporaryProjectLink } from "../../projectLinks.js";
import {
  fetchChatCheckpointActivity,
  type ChatCheckpointActivity,
  type PrInsightArtifactRecord,
  type ProjectLink,
  type TaskView,
} from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import type { ReviewActivityItem } from "./activityTypes.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";
import {
  loadPrInsightActivity,
  loadReviewActivity,
  taskViewerProjectLinksCacheKey,
} from "./taskViewerActivityLoaders.js";
import {
  buildPrInsightHistoryMeta,
  buildSelectedPrInsightComparison,
  buildSelectedPrInsightRefreshComparison,
  filterPrInsightActivity,
} from "./taskViewerPrInsightState.js";
import { isTemporaryActivity } from "./activityGrouping.js";
import { useCheckpointDetails } from "./useCheckpointDetails.js";
import { useTaskRuns } from "./useTaskRuns.js";

export function useTaskViewerRuntime(projectLinks: ProjectLink[]) {
  const taskRuns = useTaskRuns();
  const { setSelected: setTaskSelected, setSelectedId: setTaskSelectedId } = taskRuns;
  const autoSelectedInitialActivity = useRef(false);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [selectedPrInsightId, setSelectedPrInsightId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [reviewProjectLinkFilter, setReviewProjectLinkFilter] = useState("all");
  const [reviewKindFilter, setReviewKindFilter] = useState<ReviewOperationEvent["kind"] | "all">(
    "all",
  );
  const [prInsightProjectLinkFilter, setPrInsightProjectLinkFilter] = useState("all");
  const [prInsightKindFilter, setPrInsightKindFilter] = useState<
    PrInsightArtifactRecord["kind"] | "all"
  >("all");
  const [error, setError] = useState<string | null>(null);
  const projectLinkCacheKey = useMemo(
    () => taskViewerProjectLinksCacheKey(projectLinks),
    [projectLinks],
  );
  const temporaryProjectLinkIds = useMemo(
    () => new Set(projectLinks.filter(isTemporaryProjectLink).map((link) => link.id)),
    [projectLinks],
  );

  const reviewActivityQuery = useQuery({
    queryKey: ["activityReviewOperations", projectLinkCacheKey],
    enabled: projectLinks.length > 0,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      if (!Array.isArray(previousKey)) return undefined;
      return previousKey[1] === projectLinkCacheKey ? previous : undefined;
    },
    queryFn: () => loadReviewActivity(projectLinks),
  });

  const prInsightActivityQuery = useQuery({
    queryKey: ["activityPrInsights", projectLinkCacheKey],
    enabled: projectLinks.length > 0,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      if (!Array.isArray(previousKey)) return undefined;
      return previousKey[1] === projectLinkCacheKey ? previous : undefined;
    },
    queryFn: () => loadPrInsightActivity(projectLinks),
  });

  const checkpointActivityQuery = useQuery({
    queryKey: ["activityCheckpoints"],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: fetchChatCheckpointActivity,
  });
  const { refetch: refetchReviewActivity } = reviewActivityQuery;
  const { refetch: refetchPrInsightActivity } = prInsightActivityQuery;
  const { refetch: refetchCheckpointActivity } = checkpointActivityQuery;

  const reviewActivity = reviewActivityQuery.data ?? [];
  const prInsightActivity = prInsightActivityQuery.data?.items ?? [];
  const prInsightHistory = prInsightActivityQuery.data?.history ?? [];
  const checkpointActivity = checkpointActivityQuery.data ?? [];
  const reviewLoading = reviewActivityQuery.isLoading && reviewActivity.length === 0;
  const prInsightLoading = prInsightActivityQuery.isLoading && prInsightActivity.length === 0;
  const checkpointLoading = checkpointActivityQuery.isLoading && checkpointActivity.length === 0;
  const activityRefreshing =
    taskRuns.refreshing ||
    (reviewActivityQuery.isFetching && reviewActivity.length > 0) ||
    (prInsightActivityQuery.isFetching && prInsightActivity.length > 0) ||
    (checkpointActivityQuery.isFetching && checkpointActivity.length > 0);

  const refreshReviewActivity = useCallback(async () => {
    await refetchReviewActivity();
  }, [refetchReviewActivity]);

  const refreshPrInsightActivity = useCallback(async () => {
    await refetchPrInsightActivity();
  }, [refetchPrInsightActivity]);

  const refreshCheckpointActivity = useCallback(async () => {
    await refetchCheckpointActivity();
  }, [refetchCheckpointActivity]);

  useEffect(() => {
    const raw = sessionStorage.getItem(ACTIVITY_HANDOFF_KEY);
    if (!raw) return;
    let draft: ActivityHandoffDraft | null = null;
    try {
      draft = JSON.parse(raw) as ActivityHandoffDraft;
    } catch {
      sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
      return;
    }
    if (draft.kind !== "pr_insight" || !draft.artifactId) {
      sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
      return;
    }
    const draftProjectLinkId = handoffProjectLinkId(draft);
    const target = prInsightActivity.find((event) => (
      event.id === draft.artifactId &&
      (!draftProjectLinkId || prInsightArtifactProjectLinkId(event) === draftProjectLinkId)
    ));
    if (!target) return;
    setPrInsightProjectLinkFilter(prInsightArtifactProjectLinkId(target));
    setPrInsightKindFilter(target.kind);
    setSelectedPrInsightId(target.id);
    setSelectedReviewId(null);
    setSelectedCheckpointId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
    sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
  }, [prInsightActivity, setTaskSelected, setTaskSelectedId]);

  useEffect(() => {
    if (autoSelectedInitialActivity.current) return;
    if (sessionStorage.getItem(ACTIVITY_HANDOFF_KEY)) return;
    if (taskRuns.selectedId || selectedReviewId || selectedPrInsightId || selectedCheckpointId) return;
    if (taskRuns.loading || reviewLoading || prInsightLoading || checkpointLoading) return;

    const persistedCheckpoints = checkpointActivity.filter(
      (event) => !isTemporaryActivity(event, temporaryProjectLinkIds),
    );
    const persistedPrInsights = prInsightActivity.filter(
      (event) => !isTemporaryActivity(event, temporaryProjectLinkIds),
    );
    const persistedReviews = reviewActivity.filter(
      (event) => !isTemporaryActivity(event, temporaryProjectLinkIds),
    );
    const hasPersistedActivity =
      taskRuns.tasks.length > 0 ||
      persistedCheckpoints.length > 0 ||
      persistedPrInsights.length > 0 ||
      persistedReviews.length > 0;
    const defaultSelection = defaultActivitySelection({
      tasks: taskRuns.tasks,
      checkpoints: hasPersistedActivity ? persistedCheckpoints : checkpointActivity,
      prInsights: hasPersistedActivity ? persistedPrInsights : prInsightActivity,
      reviews: hasPersistedActivity ? persistedReviews : reviewActivity,
    });
    if (!defaultSelection) return;

    autoSelectedInitialActivity.current = true;
    if (defaultSelection.kind === "task") {
      setTaskSelectedId(defaultSelection.id);
      return;
    }
    if (defaultSelection.kind === "checkpoint") {
      setSelectedCheckpointId(defaultSelection.id);
      return;
    }
    if (defaultSelection.kind === "prInsight") {
      setSelectedPrInsightId(defaultSelection.id);
      return;
    }
    setSelectedReviewId(defaultSelection.id);
  }, [
    checkpointActivity,
    checkpointLoading,
    prInsightActivity,
    prInsightLoading,
    reviewActivity,
    reviewLoading,
    selectedCheckpointId,
    selectedPrInsightId,
    selectedReviewId,
    setTaskSelectedId,
    taskRuns.loading,
    taskRuns.selectedId,
    taskRuns.tasks,
    temporaryProjectLinkIds,
  ]);

  const selectedReview = useMemo(
    () => reviewActivity.find((event) => event.id === selectedReviewId) ?? null,
    [reviewActivity, selectedReviewId],
  );

  const selectedPrInsight = useMemo(
    () => prInsightActivity.find((event) => event.id === selectedPrInsightId) ?? null,
    [prInsightActivity, selectedPrInsightId],
  );

  const prInsightHistoryMeta = useMemo(() => {
    return buildPrInsightHistoryMeta(prInsightActivity, prInsightHistory);
  }, [prInsightActivity, prInsightHistory]);

  const selectedPrInsightComparison = useMemo(() => {
    return buildSelectedPrInsightComparison(prInsightActivity, selectedPrInsight);
  }, [prInsightActivity, selectedPrInsight]);

  const selectedPrInsightRefreshComparison = useMemo(() => {
    return buildSelectedPrInsightRefreshComparison(prInsightActivity, selectedPrInsight);
  }, [prInsightActivity, selectedPrInsight]);

  const selectedCheckpoint = useMemo(
    () => checkpointActivity.find((event) => event.id === selectedCheckpointId) ?? null,
    [checkpointActivity, selectedCheckpointId],
  );
  const checkpointDetails = useCheckpointDetails(selectedCheckpoint, setError);

  const filteredReviewActivity = useMemo(() => {
    return reviewActivity.filter((event) => {
      if (reviewProjectLinkFilter !== "all" && event.projectLinkId !== reviewProjectLinkFilter) return false;
      if (reviewKindFilter !== "all" && event.kind !== reviewKindFilter) return false;
      return true;
    });
  }, [reviewActivity, reviewKindFilter, reviewProjectLinkFilter]);

  const filteredPrInsightActivity = useMemo(() => {
    return filterPrInsightActivity(prInsightActivity, prInsightProjectLinkFilter, prInsightKindFilter);
  }, [prInsightActivity, prInsightKindFilter, prInsightProjectLinkFilter]);

  useEffect(() => {
    if (!selectedReviewId) return;
    if (filteredReviewActivity.some((event) => event.id === selectedReviewId)) return;
    setSelectedReviewId(filteredReviewActivity[0]?.id ?? null);
  }, [filteredReviewActivity, selectedReviewId]);

  useEffect(() => {
    if (!selectedPrInsightId) return;
    if (filteredPrInsightActivity.some((event) => event.id === selectedPrInsightId)) return;
    setSelectedPrInsightId(filteredPrInsightActivity[0]?.id ?? null);
  }, [filteredPrInsightActivity, selectedPrInsightId]);

  useEffect(() => {
    if (!selectedCheckpointId) return;
    if (checkpointActivity.some((event) => event.id === selectedCheckpointId)) return;
    setSelectedCheckpointId(null);
    setSelectedReviewId(null);
    setSelectedPrInsightId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
  }, [
    checkpointActivity,
    selectedCheckpointId,
    setTaskSelected,
    setTaskSelectedId,
  ]);

  function selectTask(taskId: string): void {
    setTaskSelectedId(taskId);
    setSelectedReviewId(null);
    setSelectedPrInsightId(null);
    setSelectedCheckpointId(null);
  }

  function selectReviewActivity(eventId: string): void {
    setSelectedReviewId(eventId);
    setSelectedPrInsightId(null);
    setSelectedCheckpointId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
  }

  function selectPrInsightActivity(eventId: string): void {
    setSelectedPrInsightId(eventId);
    setSelectedReviewId(null);
    setSelectedCheckpointId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
  }

  function selectCheckpointActivity(eventId: string): void {
    setSelectedCheckpointId(eventId);
    setSelectedReviewId(null);
    setSelectedPrInsightId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
  }

  function clearSelection(): void {
    setSelectedCheckpointId(null);
    setSelectedReviewId(null);
    setSelectedPrInsightId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([
      taskRuns.refresh(),
      refreshReviewActivity(),
      refreshPrInsightActivity(),
      refreshCheckpointActivity(),
    ]);
  }

  return {
    tasks: taskRuns.tasks,
    selected: taskRuns.selected,
    selectedId: taskRuns.selectedId,
    selectedReview,
    selectedPrInsight,
    selectedCheckpoint,
    loading: taskRuns.loading,
    refreshing: activityRefreshing,
    activeCount: taskRuns.activeCount,
    error: taskRuns.error ?? error,
    checkpointActivity,
    checkpointLoading,
    checkpointPreview: checkpointDetails.checkpointPreview,
    checkpointPreviewLoading: checkpointDetails.checkpointPreviewLoading,
    checkpointRollbackPlan: checkpointDetails.checkpointRollbackPlan,
    checkpointRollbackLoading: checkpointDetails.checkpointRollbackLoading,
    filteredPrInsightActivity,
    prInsightLoading,
    prInsightProjectLinkFilter,
    prInsightKindFilter,
    prInsightHistoryMeta,
    selectedPrInsightComparison,
    selectedPrInsightRefreshComparison,
    selectedPrInsightId,
    filteredReviewActivity,
    reviewLoading,
    reviewProjectLinkFilter,
    reviewKindFilter,
    selectedReviewId,
    selectedCheckpointId,
    refreshAll,
    selectTask,
    selectCheckpointActivity,
    selectPrInsightActivity,
    selectReviewActivity,
    clearSelection,
    setPrInsightProjectLinkFilter,
    setPrInsightKindFilter,
    setReviewProjectLinkFilter,
    setReviewKindFilter,
  };
}

type DefaultActivitySelection =
  | { kind: "task"; id: string }
  | { kind: "checkpoint"; id: string }
  | { kind: "prInsight"; id: string }
  | { kind: "review"; id: string };

export function defaultActivitySelection({
  tasks,
  checkpoints,
  prInsights,
  reviews,
}: {
  tasks: Pick<TaskView, "id" | "createdAt">[];
  checkpoints: Pick<ChatCheckpointActivity, "id" | "at">[];
  prInsights: Pick<PrInsightActivityItem, "id" | "at">[];
  reviews: Pick<ReviewActivityItem, "id" | "at">[];
}): DefaultActivitySelection | null {
  const candidates: Array<DefaultActivitySelection & { timestamp: number; priority: number }> = [
    ...tasks.map((task) => ({
      kind: "task" as const,
      id: task.id,
      timestamp: numericActivityTimestamp(task.createdAt),
      priority: 4,
    })),
    ...checkpoints.map((checkpoint) => ({
      kind: "checkpoint" as const,
      id: checkpoint.id,
      timestamp: numericActivityTimestamp(checkpoint.at),
      priority: 3,
    })),
    ...prInsights.map((insight) => ({
      kind: "prInsight" as const,
      id: insight.id,
      timestamp: isoActivityTimestamp(insight.at),
      priority: 2,
    })),
    ...reviews.map((review) => ({
      kind: "review" as const,
      id: review.id,
      timestamp: isoActivityTimestamp(review.at),
      priority: 1,
    })),
  ].filter((candidate) => candidate.id && candidate.timestamp > 0);

  candidates.sort((a, b) => b.timestamp - a.timestamp || b.priority - a.priority);
  const selected = candidates[0];
  if (!selected) return null;
  return { kind: selected.kind, id: selected.id };
}

function numericActivityTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value < 10_000_000_000 ? value * 1000 : value;
}

function isoActivityTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
