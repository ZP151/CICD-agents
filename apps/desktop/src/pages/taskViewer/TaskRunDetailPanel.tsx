import type { TaskView } from "../../api.js";
import { duration, formatTime, statusClass, taskTitle } from "./activityPresentation.js";
import { operationDetailSummary } from "./operationDetailSummary.js";
import { ActivityDetailSection } from "./ActivityDetailPrimitives.js";

function shouldFoldStepDetail(detail: string): boolean {
  const trimmed = detail.trim();
  if (trimmed.length > 180) return true;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  return /"?(returncode|stdout|stderr|execution_metadata)"?\s*:/.test(trimmed);
}

export function TaskRunDetailPanel({ task }: { task: TaskView }): JSX.Element {
  return (
    <div className="space-y-5">
      <header className="border-b border-[rgb(var(--app-border))] pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${statusClass(task.status)}`}
          >
            {task.status}
          </span>
          <span className="text-xs text-[rgb(var(--app-text-muted))]">{task.kind}</span>
          {duration(task) && (
            <span className="text-xs text-[rgb(var(--app-text-muted))]">{duration(task)}</span>
          )}
        </div>
        <h2 className="text-lg font-semibold text-[rgb(var(--app-text))]">{taskTitle(task)}</h2>
        <p className="mt-1 font-mono text-xs text-[rgb(var(--app-text-muted))]">{task.id}</p>
      </header>

      <ActivityDetailSection title="Steps">
        {task.steps.length === 0 ? (
          <p className="text-sm text-[rgb(var(--app-text-muted))]">No steps recorded yet.</p>
        ) : (
          <ol className="divide-y divide-[rgb(var(--app-border))]/60">
            {task.steps.map((step) => {
              const detailShouldFold = step.detail ? shouldFoldStepDetail(step.detail) : false;
              const detailSummary = step.detail && detailShouldFold
                ? operationDetailSummary(step.detail)
                : null;
              return (
                <li
                  key={step.seq}
                  className="py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-8 shrink-0 font-mono text-xs text-[rgb(var(--app-text-muted))]">
                      {step.seq}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${statusClass(step.status)}`}
                        >
                          {step.status}
                        </span>
                        <span className="text-sm font-medium text-[rgb(var(--app-text))]">
                          {step.name}
                        </span>
                        <span className="text-xs text-[rgb(var(--app-text-muted))]">
                          {formatTime(step.createdAt)}
                        </span>
                      </div>
                      {step.detail && detailShouldFold && (
                        <>
                          <p className="mt-1 break-words text-xs text-[rgb(var(--app-text-subtle))]">
                            {detailSummary ?? "Structured step output is available."}
                          </p>
                          <details className="mt-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2">
                            <summary className="cursor-pointer text-xs font-medium text-[rgb(var(--app-text-muted))]">
                              Raw output
                            </summary>
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
                              {step.detail}
                            </pre>
                          </details>
                        </>
                      )}
                      {step.detail && !detailShouldFold && (
                        <p className="mt-1 break-words font-mono text-xs text-[rgb(var(--app-text-subtle))]">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </ActivityDetailSection>

      {task.error && (
        <section className="rounded-lg border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] p-3">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-danger))]">
            Error
          </h3>
          <p className="break-words font-mono text-xs text-[rgb(var(--app-danger))]">
            {task.error}
          </p>
        </section>
      )}
    </div>
  );
}
