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
    tone: "text-[rgb(var(--app-success))] border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft)_/_0.58)]",
  },
  {
    key: "needs_human_review",
    title: "Needs human review",
    description: "Warnings, sensitive paths, or approval guardrails that need judgment.",
    tone: "review-lane-human text-[rgb(var(--app-warning))] border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft)_/_0.58)]",
  },
  {
    key: "blocked",
    title: "Blocked",
    description: "High-risk findings, failed pipeline checks, or merge conflicts.",
    tone: "text-[rgb(var(--app-danger))] border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft)_/_0.58)]",
  },
  {
    key: "watching",
    title: "Watching",
    description: "PRs waiting for commits, pipeline results, or approval configuration.",
    tone: "text-[rgb(var(--app-accent-readable))] border-[rgb(var(--app-border))] bg-[rgb(var(--app-accent-soft)_/_0.62)]",
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
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

export function riskTone(risk: ReviewQueueItem["decisionRiskLevel"]): string {
  if (risk === "high") return "bg-[rgb(var(--app-danger-soft))] text-[rgb(var(--app-danger))] ring-[rgb(var(--app-danger-border))]";
  if (risk === "medium") return "bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning-border))]";
  return "bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success-border))]";
}

export function severityTone(severity: ReviewFinding["severity"]): string {
  if (severity === "blocking") return "text-[rgb(var(--app-danger))] bg-[rgb(var(--app-danger-soft))] ring-[rgb(var(--app-danger-border))]";
  if (severity === "warning") return "text-[rgb(var(--app-warning))] bg-[rgb(var(--app-warning-soft))] ring-[rgb(var(--app-warning-border))]";
  return "text-[rgb(var(--app-text-muted))] bg-[rgb(var(--app-surface-raised))] ring-[rgb(var(--app-border))]";
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

export function projectLinkReviewQueueCacheKey(
  projectLink: {
    id?: string;
    repoPath?: string;
    defaultBranch?: string;
    targetBranch?: string;
    adoOrgUrl?: string;
    adoProject?: string;
    adoRepoName?: string;
    updatedAt?: number;
  } | null,
  fallbackProjectLinkId = "",
): string {
  const normalize = (value: string | undefined) =>
    (value ?? "").trim().replace(/^refs\/heads\//, "").toLowerCase();
  return [
    projectLink?.id ?? fallbackProjectLinkId,
    projectLink?.repoPath ?? "",
    projectLink?.adoOrgUrl ?? "",
    projectLink?.adoProject ?? "",
    projectLink?.adoRepoName ?? "",
    normalize(projectLink?.defaultBranch),
    normalize(projectLink?.targetBranch),
    String(projectLink?.updatedAt ?? ""),
  ].join("\u001f");
}

export function shortCommit(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 12) : "commit unavailable";
}
