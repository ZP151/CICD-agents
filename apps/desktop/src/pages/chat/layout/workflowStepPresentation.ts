import type { WorkflowEventState } from "../chat.types.js";
import type {
  WorkflowStep,
  WorkflowStepActionState,
} from "../workflowTaskState.js";

export function workflowStepDotClass(step: WorkflowStep, actionState: WorkflowStepActionState): string {
  const base = "mt-1 h-3.5 w-3.5 shrink-0 rounded-full border";
  if (actionState === "blocked") return `${base} border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))]`;
  if (actionState === "running") return `${base} border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent-soft))]`;
  if (actionState === "waiting") return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]`;
  if (actionState === "done" || step.done) return `${base} border-[rgb(var(--app-success))] bg-[rgb(var(--app-success))]`;
  if (step.active) return `${base} border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))]`;
  return `${base} border-[rgb(var(--app-border))]`;
}

export function workflowStepActionDisabled(actionState: WorkflowStepActionState): boolean {
  return actionState === "running" || actionState === "waiting" || actionState === "blocked";
}

export function workflowStepActionClass(step: WorkflowStep, actionState: WorkflowStepActionState): string {
  const base = "inline-flex min-w-0 max-w-full items-center gap-1.5 text-left transition hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-65";
  if (actionState === "blocked") return `${base} text-[rgb(var(--app-danger))]`;
  if (actionState === "running") return `${base} text-[rgb(var(--app-accent-readable))]`;
  if (actionState === "waiting") return `${base} text-[rgb(var(--app-text-subtle))]`;
  if (actionState === "done" || step.done) return `${base} text-[rgb(var(--app-text-subtle))]`;
  return `${base} underline decoration-dotted underline-offset-2`;
}

export function workflowStepActionBadgeClass(actionState: WorkflowStepActionState): string {
  const base = "shrink-0 rounded border px-1 py-px text-[10px] font-medium";
  if (actionState === "blocked") return `${base} border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] text-[rgb(var(--app-danger))]`;
  if (actionState === "running") return `${base} border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent-readable))]`;
  if (actionState === "waiting") return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-subtle))]`;
  return `${base} border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))]`;
}

export function workflowStepActionBadgeLabel(actionState: WorkflowStepActionState): string {
  if (actionState === "running") return "Running";
  if (actionState === "waiting") return "Wait";
  if (actionState === "blocked") return "Blocked";
  if (actionState === "done") return "Done";
  return "";
}

export function workflowStepActionTitle(
  step: WorkflowStep,
  actionState: WorkflowStepActionState,
  workflowState: WorkflowEventState | null,
): string {
  if (actionState === "running") return `${step.label} is running.`;
  if (actionState === "waiting") return "Wait for the current workflow action to finish.";
  if (actionState === "blocked") return workflowState?.currentStep ?? "Resolve the blocked workflow before running another action.";
  if (actionState === "done") return `Run ${step.label.toLowerCase()} again.`;
  return `Run ${step.label.toLowerCase()}`;
}
