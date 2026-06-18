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
    ? "bg-red-500"
    : hasApproval
      ? "bg-amber-500"
      : running
        ? "bg-[rgb(var(--app-text-subtle))]"
        : "bg-emerald-500";
  return `h-1.5 w-1.5 rounded-full ${color}`;
}

export function timelineStatusPillClass(
  hasError: boolean,
  running: boolean,
  hasApproval: boolean,
): string {
  if (hasError) {
    return "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  }
  if (hasApproval) {
    return "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]";
  }
  if (running) {
    return "rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400";
  }
  return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
}

export function timelineGroupRailClass(status: ExecutionGroupStatus): string {
  const color =
    status === "error"
      ? "bg-red-500"
      : status === "approval"
        ? "bg-amber-500"
        : status === "running"
          ? "bg-blue-500"
          : "bg-emerald-500";
  const motion = status === "running" ? " animate-pulse" : "";
  return `mt-1 h-8 w-1 shrink-0 rounded-full ${color}${motion}`;
}

export function timelineGroupPillClass(status: ExecutionGroupStatus): string {
  if (status === "error") {
    return "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  }
  if (status === "approval") {
    return "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]";
  }
  if (status === "running") {
    return "rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400";
  }
  return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
}

export function timelineStatePillClass(state: ExecutionTimelineState, ok?: boolean): string {
  if (state === "error" || ok === false) {
    return "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  }
  if (isRunningState(state)) {
    return "rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400";
  }
  return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
}

export function timelineDotClass(item: ExecutionTimelineItem, pending: boolean): string {
  const color =
    item.state === "error" || item.ok === false
      ? "bg-red-500"
      : pending
        ? "bg-[rgb(var(--app-text-subtle))] animate-pulse"
        : "bg-emerald-500";
  return `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${color}`;
}
