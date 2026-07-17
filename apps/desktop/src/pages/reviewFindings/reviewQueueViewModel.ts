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
    tone: "text-emerald-800 border-emerald-500/30 bg-emerald-500/10 dark:text-emerald-300",
  },
  {
    key: "needs_human_review",
    title: "Needs human review",
    description: "Warnings, sensitive paths, or approval guardrails that need judgment.",
    tone: "review-lane-human text-amber-800 border-amber-500/35 bg-amber-500/10 dark:text-amber-300",
  },
  {
    key: "blocked",
    title: "Blocked",
    description: "High-risk findings, failed pipeline checks, or merge conflicts.",
    tone: "text-red-800 border-red-500/30 bg-red-500/10 dark:text-red-300",
  },
  {
    key: "watching",
    title: "Watching",
    description: "PRs waiting for commits, pipeline results, or approval configuration.",
    tone: "text-sky-800 border-sky-500/30 bg-sky-500/10 dark:text-sky-300",
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
  if (risk === "high") return "bg-red-500/10 text-red-700 ring-red-500/30 dark:text-red-300";
  if (risk === "medium") return "bg-amber-500/10 text-amber-800 ring-amber-500/30 dark:text-amber-300";
  return "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300";
}

export function severityTone(severity: ReviewFinding["severity"]): string {
  if (severity === "blocking") return "text-red-700 bg-red-500/10 ring-red-500/30 dark:text-red-300";
  if (severity === "warning") return "text-amber-800 bg-amber-500/10 ring-amber-500/30 dark:text-amber-300";
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
