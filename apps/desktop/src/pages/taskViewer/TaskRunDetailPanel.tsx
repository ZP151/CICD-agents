import type { TaskView } from "../../api.js";
import { duration, formatTime, statusClass, taskTitle } from "./activityPresentation.js";

export function TaskRunDetailPanel({ task }: { task: TaskView }): JSX.Element {
  return (
    <div className="space-y-5">
      <header className="border-b border-zinc-800/70 pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(task.status)}`}
          >
            {task.status}
          </span>
          <span className="text-xs text-zinc-600">{task.kind}</span>
          {duration(task) && <span className="text-xs text-zinc-600">{duration(task)}</span>}
        </div>
        <h2 className="text-lg font-semibold text-zinc-100">{taskTitle(task)}</h2>
        <p className="mt-1 font-mono text-xs text-zinc-600">{task.id}</p>
      </header>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">Steps</h3>
        {task.steps.length === 0 ? (
          <p className="text-sm text-zinc-600">No steps recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {task.steps.map((step) => (
              <li
                key={step.seq}
                className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 px-3 py-2"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 w-8 shrink-0 font-mono text-xs text-zinc-600">
                    {step.seq}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusClass(step.status)}`}
                      >
                        {step.status}
                      </span>
                      <span className="text-sm font-medium text-zinc-200">{step.name}</span>
                      <span className="text-xs text-zinc-600">{formatTime(step.createdAt)}</span>
                    </div>
                    {step.detail && (
                      <p className="mt-1 break-words font-mono text-xs text-zinc-500">
                        {step.detail}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {task.error && (
        <section className="rounded-lg border border-red-900/50 bg-red-950/20 p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-400">Error</h3>
          <p className="break-words font-mono text-xs text-red-300">{task.error}</p>
        </section>
      )}
    </div>
  );
}
