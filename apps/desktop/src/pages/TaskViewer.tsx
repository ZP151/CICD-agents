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
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Task viewer</h2>
      <div className="flex items-center gap-2">
        <input
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
          placeholder="task id"
          value={taskId}
          onChange={(e) => setTaskId(e.target.value)}
        />
        <button
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white"
          onClick={() => setActive(true)}
        >
          Stream
        </button>
      </div>
      <p className="text-sm text-zinc-300">status: {status || "(none)"}</p>
      <ul className="space-y-1 text-sm">
        {steps.map((s) => (
          <li key={s.seq}>
            <span className="text-zinc-500">{s.status.padEnd(5)}</span> {s.name} - {s.detail}
          </li>
        ))}
      </ul>
    </div>
  );
}
