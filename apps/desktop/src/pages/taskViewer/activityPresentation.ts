import type { TaskView } from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";

export function statusClass(status: string): string {
  if (status === "succeeded") return "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20";
  if (status === "failed") return "bg-red-500/10 text-red-400 ring-red-500/20";
  if (status === "running") return "bg-blue-500/10 text-blue-400 ring-blue-500/20";
  if (status === "queued") return "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20";
  return "bg-zinc-800 text-zinc-400 ring-zinc-700";
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
    ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
    : "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20";
}
