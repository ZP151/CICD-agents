import type {
  ReviewFinding,
  ReviewQueueItem,
} from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";

export type ActivityCategory = "all" | "review" | "disposition" | "ado" | "errors";

export const lanes: Array<{
  key: ReviewQueueItem["decisionQueue"];
  title: string;
  description: string;
  tone: string;
}> = [
  {
    key: "auto_approved",
    title: "Auto-approved",
    description: "Low-risk PRs approved by the Review Agent with an audit record.",
    tone: "text-emerald-400 border-emerald-900/50 bg-emerald-950/10",
  },
  {
    key: "needs_human_review",
    title: "Needs human review",
    description: "Warnings, sensitive paths, or approval guardrails that need judgment.",
    tone: "review-lane-human text-yellow-400 border-yellow-900/50 bg-yellow-950/10",
  },
  {
    key: "blocked",
    title: "Blocked",
    description: "High-risk findings, failed pipeline checks, or merge conflicts.",
    tone: "text-red-400 border-red-900/50 bg-red-950/10",
  },
  {
    key: "watching",
    title: "Watching",
    description: "PRs waiting for commits, pipeline results, or approval configuration.",
    tone: "text-blue-400 border-blue-900/50 bg-blue-950/10",
  },
];

export const activityCategories: Array<{ key: ActivityCategory; label: string }> = [
  { key: "all", label: "All" },
  { key: "review", label: "Reviews" },
  { key: "disposition", label: "Disposition" },
  { key: "ado", label: "ADO" },
  { key: "errors", label: "Errors" },
];

export function formatDate(value: string): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

export function riskTone(risk: ReviewQueueItem["decisionRiskLevel"]): string {
  if (risk === "high") return "bg-red-950/30 text-red-400 ring-red-900/60";
  if (risk === "medium") return "bg-yellow-950/30 text-yellow-400 ring-yellow-900/60";
  return "bg-emerald-950/30 text-emerald-400 ring-emerald-900/60";
}

export function severityTone(severity: ReviewFinding["severity"]): string {
  if (severity === "blocking") return "text-red-400 bg-red-950/30 ring-red-900/60";
  if (severity === "warning") return "text-yellow-400 bg-yellow-950/30 ring-yellow-900/60";
  return "text-zinc-400 bg-zinc-800/50 ring-zinc-700/50";
}

export function categoryLabel(category: ReviewFinding["category"]): string {
  const map: Record<ReviewFinding["category"], string> = {
    bug: "Bug",
    "missing-test": "Missing test",
    security: "Security",
    style: "Style",
    design: "Design",
  };
  return map[category] ?? category;
}

export function operationKindLabel(kind: ReviewOperationEvent["kind"]): string {
  const map: Record<ReviewOperationEvent["kind"], string> = {
    rerun: "Rerun",
    batch_rerun: "Batch",
    stale_rerun: "Stale",
    disposition: "Disposition",
    ado_retry: "ADO retry",
    insight_preview: "Insight preview",
    review_run: "Review run",
  };
  return map[kind] ?? kind;
}

export function operationActivityCategory(event: ReviewOperationEvent): ActivityCategory {
  if (!event.ok) return "errors";
  if (event.kind === "disposition") return "disposition";
  if (event.kind === "ado_retry") return "ado";
  return "review";
}

export function shortCommit(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 12) : "commit unavailable";
}
