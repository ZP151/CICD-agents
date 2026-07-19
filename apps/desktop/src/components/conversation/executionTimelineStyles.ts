import type {
  ExecutionGroupStatus,
  ExecutionTimelineItem,
  ExecutionTimelineState,
} from "./executionTimelineModel.js";
import { isRunningState } from "./executionTimelineModel.js";

export function timelineHeaderIconClass(
  hasError: boolean,
  running: boolean,
  hasApproval: boolean,
): string {
  const color = hasError
    ? "bg-[rgb(var(--app-danger))]"
    : hasApproval
      ? "bg-[rgb(var(--app-warning))]"
      : running
        ? "bg-[rgb(var(--app-text-subtle))]"
        : "bg-[rgb(var(--app-success))]";
  return `h-1.5 w-1.5 rounded-full ${color}`;
}

export function timelineStatusPillClass(
  hasError: boolean,
  running: boolean,
  hasApproval: boolean,
): string {
  if (hasError) {
    return "rounded-full border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  }
  if (hasApproval) {
    return "rounded-full border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]";
  }
  if (running) {
    return "rounded-full border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-accent-readable))]";
  }
  return "rounded-full border border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
}

export function timelineGroupRailClass(status: ExecutionGroupStatus): string {
  const color =
    status === "error"
      ? "bg-[rgb(var(--app-danger))]"
      : status === "approval"
        ? "bg-[rgb(var(--app-warning))]"
        : status === "running"
          ? "bg-[rgb(var(--app-accent))]"
          : "bg-[rgb(var(--app-success))]";
  const motion = status === "running" ? " animate-pulse" : "";
  return `mt-1 h-8 w-1 shrink-0 rounded-full ${color}${motion}`;
}

export function timelineGroupPillClass(status: ExecutionGroupStatus): string {
  if (status === "error") {
    return "rounded-full border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  }
  if (status === "approval") {
    return "rounded-full border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]";
  }
  if (status === "running") {
    return "rounded-full border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-accent-readable))]";
  }
  return "rounded-full border border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
}

export function timelineStatePillClass(state: ExecutionTimelineState, ok?: boolean): string {
  if (state === "error" || ok === false) {
    return "rounded-full border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  }
  if (isRunningState(state)) {
    return "rounded-full border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-accent-readable))]";
  }
  return "rounded-full border border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
}

export function timelineDotClass(item: ExecutionTimelineItem, pending: boolean): string {
  const color =
    item.state === "error" || item.ok === false
      ? "bg-[rgb(var(--app-danger))]"
      : pending
        ? "bg-[rgb(var(--app-text-subtle))] animate-pulse"
        : "bg-[rgb(var(--app-success))]";
  return `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${color}`;
}
