import type { TaskView } from "../../api.js";
import { parseSortableDate } from "../../safeDate.js";

export function statusClass(status: string): string {
  if (status === "succeeded")
    return "bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success-border))]";
  if (status === "failed") return "bg-[rgb(var(--app-danger-soft))] text-[rgb(var(--app-danger))] ring-[rgb(var(--app-danger-border))]";
  if (status === "running")
    return "bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent-readable))] ring-[rgb(var(--app-accent))]/30";
  if (status === "queued")
    return "bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning-border))]";
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

export function reviewOperationStatusClass(ok: boolean): string {
  return ok
    ? "bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success-border))]"
    : "bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning-border))]";
}
