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
  { key: "mine", label: "Authored by me" },
  { key: "needs_review", label: "Needs my review" },
  { key: "waiting", label: "Waiting" },
];

export function formatDate(value: string): string {
  return formatSortableDate(value);
}

export function readiness(pr: PullRequestSummary): { label: string; tone: string } {
  if (pr.isDraft) return { label: "Draft", tone: "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]" };
  if (pr.voteSummary.rejected > 0) return { label: "Changes requested", tone: "bg-[rgb(var(--app-danger-soft))] text-[rgb(var(--app-danger))] ring-[rgb(var(--app-danger-border))]" };
  if (pr.voteSummary.approved > 0) return { label: "Reviewed", tone: "bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success-border))]" };
  return { label: "Needs review", tone: "bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning-border))]" };
}

export function insightReadinessTone(value: PullRequestInsightPreview["readiness"]): { label: string; tone: string } {
  if (value === "blocked") return { label: "Blocked", tone: "border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] text-[rgb(var(--app-danger))]" };
  if (value === "needs_attention") return { label: "Needs attention", tone: "border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))]" };
  return { label: "Ready", tone: "border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))]" };
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

export function prMatchesCategory(
  pr: DisplayPullRequest,
  category: PullRequestCategory,
  currentUserName?: string,
): boolean {
  if (category === "all") return true;
  if (category === "mine") {
    return Boolean(currentUserName) && pr.createdBy.localeCompare(currentUserName ?? "", undefined, { sensitivity: "accent" }) === 0;
  }
  if (category === "needs_review") {
    return Boolean(currentUserName) && pr.reviewers.some((reviewer) =>
      reviewer.localeCompare(currentUserName ?? "", undefined, { sensitivity: "accent" }) === 0,
    );
  }
  // waiting: draft, changes requested, or not yet reviewed by anyone.
  return pr.isDraft || pr.voteSummary.rejected > 0 || pr.voteSummary.approved === 0;
}

function normalizeBranchName(value: string | undefined): string {
  return (value ?? "").trim().replace(/^refs\/heads\//, "").toLowerCase();
}
