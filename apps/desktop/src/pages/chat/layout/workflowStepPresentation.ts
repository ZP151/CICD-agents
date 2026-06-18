import type { WorkflowEventState } from "../chat.types.js";
import type {
  WorkflowStep,
  WorkflowStepActionState,
} from "../workflowTaskState.js";

export function workflowStepDotClass(step: WorkflowStep, actionState: WorkflowStepActionState): string {
  const base = "mt-1 h-3.5 w-3.5 shrink-0 rounded-full border";
  if (actionState === "blocked") return `${base} border-red-500 bg-red-500/15`;
  if (actionState === "running") return `${base} border-blue-500 bg-blue-500/25`;
  if (actionState === "waiting") return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]`;
  if (actionState === "done" || step.done) return `${base} border-emerald-500 bg-emerald-500`;
  if (step.active) return `${base} border-amber-500 bg-amber-500/20`;
  return `${base} border-[rgb(var(--app-border))]`;
}

export function workflowStepActionDisabled(actionState: WorkflowStepActionState): boolean {
  return actionState === "running" || actionState === "waiting" || actionState === "blocked";
}

export function workflowStepActionClass(step: WorkflowStep, actionState: WorkflowStepActionState): string {
  const base = "inline-flex min-w-0 max-w-full items-center gap-1.5 text-left transition hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-65";
  if (actionState === "blocked") return `${base} text-[rgb(var(--app-danger))]`;
  if (actionState === "running") return `${base} text-blue-600 dark:text-blue-300`;
  if (actionState === "waiting") return `${base} text-[rgb(var(--app-text-subtle))]`;
  if (actionState === "done" || step.done) return `${base} text-[rgb(var(--app-text-subtle))]`;
  return `${base} underline decoration-dotted underline-offset-2`;
}

export function workflowStepActionBadgeClass(actionState: WorkflowStepActionState): string {
  const base = "shrink-0 rounded border px-1 py-px text-[10px] font-medium";
  if (actionState === "blocked") return `${base} border-red-500/30 bg-red-500/10 text-[rgb(var(--app-danger))]`;
  if (actionState === "running") return `${base} border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-300`;
  if (actionState === "waiting") return `${base} border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-subtle))]`;
  return `${base} border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`;
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
