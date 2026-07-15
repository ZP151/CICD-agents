import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchTask,
  fetchTasks,
  streamTask,
  type TaskView,
} from "../../api.js";

export function useTaskRuns() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [refetchTasks]);

  useEffect(() => {
    const next = tasksQuery.data ?? [];
    if (selectedId || next.length === 0) return;
    setSelectedId(next[0]?.id ?? null);
  }, [selectedId, tasksQuery.data]);

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
        queryClient.setQueryData<TaskView>(["activityRun", selectedId], (current) =>
          current ? { ...current, status: String(data) } : current,
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
    setSelectedId(task?.id ?? null);
    if (task) queryClient.setQueryData(["activityRun", task.id], task);
  }, [queryClient]);

  return {
    tasks,
    selected,
    selectedId,
    loading,
    activeCount,
    error: error ?? (queryError instanceof Error ? queryError.message : null),
    refresh,
    setSelected,
    setSelectedId,
  };
}
