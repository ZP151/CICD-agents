export const conversationPartCardClass =
  "rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs";

export const conversationActionButtonClass =
  "rounded-md border border-[rgb(var(--app-border))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px";

export function inlineStatePillClass(state: "ready" | "running" | "error"): string {
  if (state === "error") {
    return "rounded-full border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-danger))]";
  }
  if (state === "ready") {
    return "rounded-full border border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-success))]";
  }
  return "rounded-full border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-accent-readable))]";
}

export function approvalRiskPillClass(level?: string): string {
  if (level === "high") return "rounded-full border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  if (level === "low") return "rounded-full border border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
  return "rounded-full border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]";
}

export function statusDotClass(status: "running" | "done" | "error"): string {
  const color = status === "error" ? "bg-[rgb(var(--app-danger))]" : status === "done" ? "bg-[rgb(var(--app-success))]" : "bg-[rgb(var(--app-accent))]";
  const motion = status === "running" ? " animate-pulse" : "";
  return `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${color}${motion}`;
}
