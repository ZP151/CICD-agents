import type { TaskView } from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";

export function statusClass(status: string): string {
  if (status === "succeeded") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "failed") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "running") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (status === "queued") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-zinc-100 text-zinc-600 ring-zinc-200";
}

export function formatTime(ts?: number | null): string {
  if (!ts) return "";
  return new Date(ts * 1000).toLocaleString();
}

export function duration(task: TaskView): string {
  if (!task.startedAt) return "";
  const end = task.finishedAt ?? Math.floor(Date.now() / 1000);
  const seconds = Math.max(0, end - task.startedAt);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}

export function taskTitle(task: TaskView): string {
  const payload = task.payload ?? {};
  const repo = String(payload["repoPath"] ?? "").trim();
  if (task.kind === "submit-pipeline") {
    return repo ? `Pipeline submission: ${repo}` : "Pipeline submission";
  }
  return task.kind;
}

export function latestDetail(task: TaskView): string {
  const last = task.steps[task.steps.length - 1];
  if (last?.detail) return last.detail;
  if (task.error) return task.error;
  return `${task.steps.length} step${task.steps.length === 1 ? "" : "s"}`;
}

export function reviewOperationKindLabel(kind: ReviewOperationEvent["kind"]): string {
  const map: Record<ReviewOperationEvent["kind"], string> = {
    rerun: "Rerun",
    batch_rerun: "Batch rerun",
    stale_rerun: "Stale rerun",
    disposition: "Disposition",
    ado_retry: "ADO retry",
    insight_preview: "Insight preview",
    review_run: "Review run",
  };
  return map[kind] ?? kind;
}

export function reviewOperationStatusClass(ok: boolean): string {
  return ok
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : "bg-amber-50 text-amber-700 ring-amber-200";
}
