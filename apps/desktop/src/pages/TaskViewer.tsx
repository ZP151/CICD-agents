import { useEffect, useState } from "react";
import { streamTask, fetchTask } from "../api.js";

interface StepRow {
  seq: number;
  name: string;
  detail: string;
  status: string;
}

export default function TaskViewer(): JSX.Element {
  const [taskId, setTaskId] = useState("");
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!taskId || !active) return;
    let cancelled = false;
    (async () => {
      try {
        const view = await fetchTask(taskId);
        if (!cancelled) {
          setSteps(view.steps);
          setStatus(view.status);
        }
      } catch (err) {
        if (!cancelled) setStatus(`error: ${String(err)}`);
      }
    })();
    const close = streamTask(taskId, (type, data) => {
      if (type === "step") {
        setSteps((s) => [...s, data as StepRow]);
      } else if (type === "status") {
        setStatus(String(data));
      } else if (type === "done") {
        setStatus((data as { status?: string }).status ?? "");
      }
    });
    return () => {
      cancelled = true;
      close();
    };
  }, [taskId, active]);

  return (
    <div className="mx-auto max-w-xl space-y-6 py-2">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100">Task viewer</h2>
        <p className="mt-1 text-sm text-zinc-500">Stream live output from a running task by ID.</p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 rounded-lg border border-zinc-700/60 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none transition"
            placeholder="task id"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
          />
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition"
            onClick={() => setActive(true)}
          >
            Stream
          </button>
        </div>
        <p className="text-sm text-zinc-400">
          status: <span className="text-zinc-300">{status || "(none)"}</span>
        </p>
      </section>

      {steps.length > 0 && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <ul className="space-y-1.5 text-sm font-mono">
            {steps.map((s) => (
              <li key={s.seq} className="flex gap-3">
                <span className="shrink-0 text-zinc-600 w-14">{s.status}</span>
                <span className="text-zinc-300">{s.name}</span>
                {s.detail && <span className="text-zinc-500 truncate">— {s.detail}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
