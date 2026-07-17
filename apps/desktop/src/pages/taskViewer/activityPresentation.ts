import type { TaskView } from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import { parseSortableDate } from "../../safeDate.js";

export function statusClass(status: string): string {
  if (status === "succeeded")
    return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300";
  if (status === "failed") return "bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-300";
  if (status === "running")
    return "bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent))] ring-[rgb(var(--app-accent))]/30";
  if (status === "queued")
    return "bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-300";
  return "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]";
}

export function formatTime(ts?: number | null): string {
  if (!ts || !Number.isFinite(ts)) return "";
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

export function parseIsoTimestamp(value?: string | null): number {
  return parseSortableDate(value);
}

export function formatIsoTime(value?: string | null): string {
  const timestamp = parseIsoTimestamp(value);
  if (!timestamp) return "";
  return formatTime(timestamp / 1000);
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
    ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300"
    : "bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-300";
}
