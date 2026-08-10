import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchTask,
  fetchTasks,
  streamTask,
  type TaskView,
} from "../../api.js";

/**
 * Task streams currently emit a string status. Accept the documented object
 * form as well, but never coerce arbitrary event payloads into UI text.
 */
export function taskStatusFromStream(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (
    data &&
    typeof data === "object" &&
    "status" in data &&
    typeof (data as { status?: unknown }).status === "string"
  ) {
    return (data as { status: string }).status;
  }
  return null;
}

export function useTaskRuns() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoSelectRuns, setAutoSelectRuns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({
    queryKey: ["activityRuns"],
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: fetchTasks,
  });
  const { refetch: refetchTasks } = tasksQuery;

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await refetchTasks();
      const next = result.data ?? [];
      setSelectedId((current) => current ?? (autoSelectRuns ? next[0]?.id ?? null : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [autoSelectRuns, refetchTasks]);

  useEffect(() => {
    const next = tasksQuery.data ?? [];
    if (!autoSelectRuns || selectedId || next.length === 0) return;
    setSelectedId(next[0]?.id ?? null);
  }, [autoSelectRuns, selectedId, tasksQuery.data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refetchTasks();
    }, 10000);
    return () => window.clearInterval(timer);
  }, [refetchTasks]);

  const selectedTaskQuery = useQuery({
    queryKey: ["activityRun", selectedId],
    enabled: Boolean(selectedId),
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: () => fetchTask(selectedId!),
  });

  const tasks = tasksQuery.data ?? [];
  const selected = selectedId
    ? selectedTaskQuery.data ?? tasks.find((task) => task.id === selectedId) ?? null
    : null;
  const loading = tasksQuery.isLoading && tasks.length === 0;
  const queryError = tasksQuery.error ?? selectedTaskQuery.error;
  const selectedStatus = selected?.status;

  useEffect(() => {
    if (!selectedId || !selectedStatus || !["queued", "running"].includes(selectedStatus)) return;
    const close = streamTask(selectedId, (type, data) => {
      if (type === "step") {
        queryClient.setQueryData<TaskView>(["activityRun", selectedId], (current) =>
          current ? { ...current, steps: [...current.steps, data as TaskView["steps"][number]] } : current,
        );
      } else if (type === "status") {
        const status = taskStatusFromStream(data);
        if (!status) return;
        queryClient.setQueryData<TaskView>(["activityRun", selectedId], (current) =>
          current ? { ...current, status } : current,
        );
      } else if (type === "done") {
        const done = data as { status?: string; result?: unknown; error?: string };
        queryClient.setQueryData<TaskView>(["activityRun", selectedId], (current) =>
          current
            ? {
                ...current,
                status: done.status ?? current.status,
                result: done.result ?? current.result,
                error: done.error ?? current.error,
                finishedAt: Math.floor(Date.now() / 1000),
              }
            : current,
        );
        void queryClient.invalidateQueries({ queryKey: ["activityRuns"] });
      }
    });
    return close;
  }, [queryClient, selectedId, selectedStatus]);

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === "queued" || task.status === "running").length,
    [tasks],
  );

  const setSelected = useCallback((task: TaskView | null) => {
    setAutoSelectRuns(Boolean(task));
    setSelectedId(task?.id ?? null);
    if (task) queryClient.setQueryData(["activityRun", task.id], task);
  }, [queryClient]);

  const selectById = useCallback((taskId: string | null) => {
    setAutoSelectRuns(Boolean(taskId));
    setSelectedId(taskId);
  }, []);

  return {
    tasks,
    selected,
    selectedId,
    loading,
    refreshing: tasksQuery.isFetching && tasks.length > 0,
    activeCount,
    error: error ?? (queryError instanceof Error ? queryError.message : null),
    refresh,
    setSelected,
    setSelectedId: selectById,
  };
}
