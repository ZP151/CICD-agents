import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ACTIVITY_HANDOFF_KEY, handoffProjectLinkId, type ActivityHandoffDraft } from "../../checkpointHandoff.js";
import { prInsightArtifactProjectLinkId } from "../../prInsightArtifacts.js";
import {
  fetchChatCheckpointActivity,
  type PrInsightArtifactRecord,
  type ProjectLink,
} from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import type { ReviewActivityItem } from "./activityTypes.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";
import {
  loadPrInsightActivity,
  loadReviewActivity,
} from "./taskViewerActivityLoaders.js";
import {
  buildPrInsightHistoryMeta,
  buildSelectedPrInsightComparison,
  buildSelectedPrInsightRefreshComparison,
  filterPrInsightActivity,
} from "./taskViewerPrInsightState.js";
import { useCheckpointDetails } from "./useCheckpointDetails.js";
import { useTaskRuns } from "./useTaskRuns.js";

export function useTaskViewerRuntime(projectLinks: ProjectLink[]) {
  const taskRuns = useTaskRuns();
  const { setSelected: setTaskSelected, setSelectedId: setTaskSelectedId } = taskRuns;
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
    () => projectLinks.map((projectLink) => projectLink.id).join("|"),
    [projectLinks],
  );

  const reviewActivityQuery = useQuery({
    queryKey: ["activityReviewOperations", projectLinkCacheKey],
    enabled: projectLinks.length > 0,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: () => loadReviewActivity(projectLinks),
  });

  const prInsightActivityQuery = useQuery({
    queryKey: ["activityPrInsights", projectLinkCacheKey],
    enabled: projectLinks.length > 0,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
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
    setPrInsightProjectLinkFilter,
    setPrInsightKindFilter,
    setReviewProjectLinkFilter,
    setReviewKindFilter,
  };
}
