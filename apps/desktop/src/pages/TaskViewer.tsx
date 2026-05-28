import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchTask, fetchTasks, streamTask, type TaskView } from "../api.js";

function statusClass(status: string): string {
  if (status === "succeeded") return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20";
  if (status === "failed") return "bg-red-500/10 text-red-400 ring-red-500/20";
  if (status === "running") return "bg-blue-500/10 text-blue-400 ring-blue-500/20";
  if (status === "queued") return "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20";
  return "bg-zinc-800 text-zinc-400 ring-zinc-700";
}

function formatTime(ts?: number | null): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

function duration(task: TaskView): string {
  if (!task.startedAt) return "";
  const end = task.finishedAt ?? Math.floor(Date.now() / 1000);
  const seconds = Math.max(0, end - task.startedAt);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

function taskTitle(task: TaskView): string {
  const payload = task.payload ?? {};
  const repo = String(payload["repoPath"] ?? "").trim();
  if (task.kind === "submit-pipeline") {
    return repo ? `Pipeline submission: ${repo}` : "Pipeline submission";
  }
  return task.kind;
}

function latestDetail(task: TaskView): string {
  const last = task.steps[task.steps.length - 1];
  if (last?.detail) return last.detail;
  if (task.error) return task.error;
  return `${task.steps.length} step${task.steps.length === 1 ? "" : "s"}`;
}

export default function TaskViewer(): JSX.Element {
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
        setSelected((current) => current
          ? { ...current, steps: [...current.steps, data as TaskView["steps"][number]] }
          : current);
      } else if (type === "status") {
        setSelected((current) => current ? { ...current, status: String(data) } : current);
      } else if (type === "done") {
        const done = data as { status?: string; result?: unknown; error?: string };
        setSelected((current) => current
          ? {
              ...current,
              status: done.status ?? current.status,
              result: done.result ?? current.result,
              error: done.error ?? current.error,
              finishedAt: Math.floor(Date.now() / 1000),
            }
          : current);
        void refresh();
      }
    });
    return close;
  }, [selectedId, selected, refresh]);

  const activeCount = useMemo(
    () => tasks.filter((task) => task.status === "queued" || task.status === "running").length,
    [tasks],
  );

  return (
    <div className="flex min-h-full w-full gap-5">
      <section className="flex w-[360px] shrink-0 flex-col border-r border-zinc-800/70 pr-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-100">Activity</h2>
            <p className="mt-1 text-sm text-zinc-500">Agent runs and background jobs.</p>
          </div>
          <button
            onClick={() => void refresh()}
            className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>

        {activeCount > 0 && (
          <div className="mb-3 rounded-md border border-blue-900/50 bg-blue-950/20 px-3 py-2 text-xs text-blue-300">
            {activeCount} active run{activeCount === 1 ? "" : "s"}
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto space-y-1.5">
          {loading && <p className="px-1 text-sm text-zinc-600">Loading activity...</p>}
          {!loading && tasks.length === 0 && (
            <p className="px-1 text-sm text-zinc-600">No agent runs yet.</p>
          )}
          {tasks.map((task) => {
            const selectedTask = task.id === selectedId;
            return (
              <button
                key={task.id}
                onClick={() => setSelectedId(task.id)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                  selectedTask
                    ? "border-zinc-700 bg-zinc-900"
                    : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusClass(task.status)}`}>
                    {task.status}
                  </span>
                  <span className="truncate text-xs text-zinc-600">{formatTime(task.createdAt)}</span>
                </div>
                <p className="truncate text-sm font-medium text-zinc-200">{taskTitle(task)}</p>
                <p className="mt-1 truncate text-xs text-zinc-600">{latestDetail(task)}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="min-w-0 flex-1">
        {!selected && (
          <div className="flex h-full items-center justify-center text-sm text-zinc-600">
            Select a run to inspect its steps.
          </div>
        )}

        {selected && (
          <div className="space-y-5">
            <header className="border-b border-zinc-800/70 pb-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(selected.status)}`}>
                  {selected.status}
                </span>
                <span className="text-xs text-zinc-600">{selected.kind}</span>
                {duration(selected) && <span className="text-xs text-zinc-600">{duration(selected)}</span>}
              </div>
              <h2 className="text-lg font-semibold text-zinc-100">{taskTitle(selected)}</h2>
              <p className="mt-1 font-mono text-xs text-zinc-600">{selected.id}</p>
            </header>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Steps</h3>
              {selected.steps.length === 0 ? (
                <p className="text-sm text-zinc-600">No steps recorded yet.</p>
              ) : (
                <ol className="space-y-2">
                  {selected.steps.map((step) => (
                    <li key={step.seq} className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 px-3 py-2">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 w-8 shrink-0 font-mono text-xs text-zinc-600">{step.seq}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusClass(step.status)}`}>
                              {step.status}
                            </span>
                            <span className="text-sm font-medium text-zinc-200">{step.name}</span>
                            <span className="text-xs text-zinc-600">{formatTime(step.createdAt)}</span>
                          </div>
                          {step.detail && (
                            <p className="mt-1 break-words font-mono text-xs text-zinc-500">{step.detail}</p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {selected.error && (
              <section className="rounded-lg border border-red-900/50 bg-red-950/20 p-3">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-400">Error</h3>
                <p className="break-words font-mono text-xs text-red-300">{selected.error}</p>
              </section>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
