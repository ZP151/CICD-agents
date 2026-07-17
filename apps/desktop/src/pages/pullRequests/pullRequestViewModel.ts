import type {
  PullRequestInsightPreview,
  PullRequestSummary,
  ReviewRunResult,
} from "../../api.js";
import type { PrInsightArtifact } from "../../prInsightArtifacts.js";
import type {
  DisplayPullRequest,
  PullRequestCategory,
} from "./pullRequestTypes.js";
import { pullRequestRuntimeKey } from "./pullRequestTypes.js";
import { formatSortableDate, parseSortableDate } from "../../safeDate.js";

export const prCategories: Array<{ key: PullRequestCategory; label: string }> = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "draft", label: "Draft" },
  { key: "reviewed", label: "Reviewed" },
];

export function formatDate(value: string): string {
  return formatSortableDate(value);
}

export function readiness(pr: PullRequestSummary): { label: string; tone: string } {
  if (pr.isDraft) return { label: "Draft", tone: "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]" };
  if (pr.voteSummary.rejected > 0) return { label: "Changes requested", tone: "bg-red-500/10 text-red-700 ring-red-500/25 dark:text-red-300" };
  if (pr.voteSummary.approved > 0) return { label: "Reviewed", tone: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300" };
  return { label: "Needs review", tone: "bg-amber-500/10 text-amber-800 ring-amber-500/25 dark:text-amber-300" };
}

export function insightReadinessTone(value: PullRequestInsightPreview["readiness"]): { label: string; tone: string } {
  if (value === "blocked") return { label: "Blocked", tone: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300" };
  if (value === "needs_attention") return { label: "Needs attention", tone: "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300" };
  return { label: "Ready", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" };
}

export function previewOperationDetails(result: PullRequestInsightPreview): string {
  return [
    `readiness=${result.readiness ?? "not available"}`,
    `risks=${result.risks.length}`,
    `files=${result.signals.fileCount}`,
    `threads=${result.signals.threadCount}`,
    `failedBuilds=${result.signals.failedBuildCount}`,
    `tokens=${result.tokensIn}/${result.tokensOut}`,
    `source=${result.source}`,
  ].join("; ");
}

export function reviewRunOperationDetails(result: ReviewRunResult): string {
  return [
    `queue=${result.decisionQueue}`,
    `risk=${result.decisionRiskLevel}`,
    `confidence=${result.contextConfidence ?? "not available"}`,
    `findings=${result.findingCount}`,
    `discarded=${result.discardedFindings?.length ?? 0}`,
    `tokens=${result.tokensIn}/${result.tokensOut}`,
  ].join("; ");
}

export function mergeInsightArtifacts(items: PrInsightArtifact[]): PrInsightArtifact[] {
  const byId = new Map<string, PrInsightArtifact>();
  for (const item of items.sort((a, b) => parseSortableDate(b.at) - parseSortableDate(a.at))) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => parseSortableDate(b.at) - parseSortableDate(a.at));
}

export function projectLinkBranchScope(projectLink: { defaultBranch?: string } | null): string {
  return normalizeBranchName(projectLink?.defaultBranch);
}

export function projectLinkPullRequestCacheKey(
  projectLinks: Array<{
    id: string;
    repoPath?: string;
    defaultBranch?: string;
    targetBranch?: string;
    adoOrgUrl?: string;
    adoProject?: string;
    adoRepoName?: string;
    updatedAt?: number;
  }>,
): string {
  return projectLinks
    .map((projectLink) => [
      projectLink.id,
      projectLink.repoPath ?? "",
      projectLink.adoOrgUrl ?? "",
      projectLink.adoProject ?? "",
      projectLink.adoRepoName ?? "",
      normalizeBranchName(projectLink.defaultBranch),
      normalizeBranchName(projectLink.targetBranch),
      String(projectLink.updatedAt ?? ""),
    ].join("\u001f"))
    .sort((a, b) => a.localeCompare(b))
    .join("\u001e");
}

export function prInsightArtifactsCacheKey(
  projectLinkId: string | null | undefined,
  projectLinksKey: string,
): readonly ["prInsightArtifacts", string, string] {
  return ["prInsightArtifacts", projectLinkId || "all", projectLinksKey];
}

export function matchesProjectLinkBranch(pr: PullRequestSummary, projectLink: { defaultBranch?: string } | null): boolean {
  const branch = projectLinkBranchScope(projectLink);
  if (!branch || branch === "main") return true;
  return normalizeBranchName(pr.sourceBranch) === branch;
}

export function dedupePullRequests(items: DisplayPullRequest[]): DisplayPullRequest[] {
  const byKey = new Map<string, DisplayPullRequest>();
  for (const item of items) {
    const key = pullRequestRuntimeKey(item);
    if (!byKey.has(key)) byKey.set(key, item);
  }
  return [...byKey.values()];
}

export function prMatchesCategory(pr: DisplayPullRequest, category: PullRequestCategory): boolean {
  if (category === "all") return true;
  if (category === "draft") return pr.isDraft;
  if (category === "reviewed") return pr.voteSummary.approved > 0 && pr.voteSummary.rejected === 0;
  return pr.isDraft || pr.voteSummary.rejected > 0 || pr.voteSummary.approved === 0;
}

function normalizeBranchName(value: string | undefined): string {
  return (value ?? "").trim().replace(/^refs\/heads\//, "").toLowerCase();
}
