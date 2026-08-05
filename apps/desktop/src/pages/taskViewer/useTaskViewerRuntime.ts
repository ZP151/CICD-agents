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
import type { PrInsightActivityItem } from "./prInsightActivity.js";
import {
  loadPrInsightActivity,
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
  const [selectedPrInsightId, setSelectedPrInsightId] = useState<string | null>(null);
  const [selectedCheckpointId, setSelectedCheckpointId] = useState<string | null>(null);
  const [activityHandoffSource, setActivityHandoffSource] = useState<ActivityHandoffDraft["source"] | null>(null);
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
  const { refetch: refetchPrInsightActivity } = prInsightActivityQuery;
  const { refetch: refetchCheckpointActivity } = checkpointActivityQuery;

  const prInsightActivity = prInsightActivityQuery.data?.items ?? [];
  const prInsightHistory = prInsightActivityQuery.data?.history ?? [];
  const checkpointActivity = checkpointActivityQuery.data ?? [];
  const prInsightLoading = prInsightActivityQuery.isLoading && prInsightActivity.length === 0;
  const checkpointLoading = checkpointActivityQuery.isLoading && checkpointActivity.length === 0;
  const activityRefreshing =
    taskRuns.refreshing ||
    (prInsightActivityQuery.isFetching && prInsightActivity.length > 0) ||
    (checkpointActivityQuery.isFetching && checkpointActivity.length > 0);

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
    setSelectedCheckpointId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
    setActivityHandoffSource(draft.source ?? null);
    sessionStorage.removeItem(ACTIVITY_HANDOFF_KEY);
  }, [prInsightActivity, setTaskSelected, setTaskSelectedId]);

  useEffect(() => {
    if (autoSelectedInitialActivity.current) return;
    if (sessionStorage.getItem(ACTIVITY_HANDOFF_KEY)) return;
    if (taskRuns.selectedId || selectedPrInsightId || selectedCheckpointId) return;
    if (taskRuns.loading || prInsightLoading || checkpointLoading) return;

    const persistedCheckpoints = checkpointActivity.filter(
      (event) => !isTemporaryActivity(event, temporaryProjectLinkIds),
    );
    const persistedPrInsights = prInsightActivity.filter(
      (event) => !isTemporaryActivity(event, temporaryProjectLinkIds),
    );
    const hasPersistedActivity =
      taskRuns.tasks.length > 0 ||
      persistedCheckpoints.length > 0 ||
      persistedPrInsights.length > 0;
    const defaultSelection = defaultActivitySelection({
      tasks: taskRuns.tasks,
      checkpoints: hasPersistedActivity ? persistedCheckpoints : checkpointActivity,
      prInsights: hasPersistedActivity ? persistedPrInsights : prInsightActivity,
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
    setSelectedPrInsightId(defaultSelection.id);
  }, [
    checkpointActivity,
    checkpointLoading,
    prInsightActivity,
    prInsightLoading,
    selectedCheckpointId,
    selectedPrInsightId,
    setTaskSelectedId,
    taskRuns.loading,
    taskRuns.selectedId,
    taskRuns.tasks,
    temporaryProjectLinkIds,
  ]);

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

  const filteredPrInsightActivity = useMemo(() => {
    return filterPrInsightActivity(prInsightActivity, prInsightProjectLinkFilter, prInsightKindFilter);
  }, [prInsightActivity, prInsightKindFilter, prInsightProjectLinkFilter]);

  useEffect(() => {
    if (!selectedPrInsightId) return;
    if (filteredPrInsightActivity.some((event) => event.id === selectedPrInsightId)) return;
    setSelectedPrInsightId(filteredPrInsightActivity[0]?.id ?? null);
  }, [filteredPrInsightActivity, selectedPrInsightId]);

  useEffect(() => {
    if (!selectedCheckpointId) return;
    if (checkpointActivity.some((event) => event.id === selectedCheckpointId)) return;
    setSelectedCheckpointId(null);
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
    setSelectedPrInsightId(null);
    setSelectedCheckpointId(null);
    setActivityHandoffSource(null);
  }

  function selectPrInsightActivity(eventId: string): void {
    setSelectedPrInsightId(eventId);
    setSelectedCheckpointId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
    setActivityHandoffSource(null);
  }

  function selectCheckpointActivity(eventId: string): void {
    setSelectedCheckpointId(eventId);
    setSelectedPrInsightId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
    setActivityHandoffSource(null);
  }

  function clearSelection(): void {
    setSelectedCheckpointId(null);
    setSelectedPrInsightId(null);
    setTaskSelectedId(null);
    setTaskSelected(null);
    setActivityHandoffSource(null);
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([
      taskRuns.refresh(),
      refreshPrInsightActivity(),
      refreshCheckpointActivity(),
    ]);
  }

  return {
    tasks: taskRuns.tasks,
    selected: taskRuns.selected,
    selectedId: taskRuns.selectedId,
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
    selectedCheckpointId,
    activityHandoffSource,
    refreshAll,
    selectTask,
    selectCheckpointActivity,
    selectPrInsightActivity,
    clearSelection,
    setPrInsightProjectLinkFilter,
    setPrInsightKindFilter,
  };
}

type DefaultActivitySelection =
  | { kind: "task"; id: string }
  | { kind: "checkpoint"; id: string }
  | { kind: "prInsight"; id: string };

export function defaultActivitySelection({
  tasks,
  checkpoints,
  prInsights,
}: {
  tasks: Pick<TaskView, "id" | "createdAt">[];
  checkpoints: Pick<ChatCheckpointActivity, "id" | "at">[];
  prInsights: Pick<PrInsightActivityItem, "id" | "at">[];
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
