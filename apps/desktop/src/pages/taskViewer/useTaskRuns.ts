import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchTask,
  fetchTasks,
  streamTask,
  type TaskView,
} from "../../api.js";

export function useTaskRuns() {
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TaskView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchTasks();
      setTasks(next);
      setSelectedId((current) => current ?? next[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    let cancelled = false;
    void fetchTask(selectedId)
      .then((task) => {
        if (!cancelled) setSelected(task);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !selected || !["queued", "running"].includes(selected.status)) return;
    const close = streamTask(selectedId, (type, data) => {
      if (type === "step") {
        setSelected((current) =>
          current
            ? { ...current, steps: [...current.steps, data as TaskView["steps"][number]] }
            : current,
        );
      } else if (type === "status") {
        setSelected((current) => (current ? { ...current, status: String(data) } : current));
      } else if (type === "done") {
        const done = data as { status?: string; result?: unknown; error?: string };
        setSelected((current) =>
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
        void refresh();
      }
    });
    return close;
  }, [selectedId, selected, refresh]);

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === "queued" || task.status === "running").length,
    [tasks],
  );

  return {
    tasks,
    selected,
    selectedId,
    loading,
    activeCount,
    error,
    refresh,
    setSelected,
    setSelectedId,
  };
}
