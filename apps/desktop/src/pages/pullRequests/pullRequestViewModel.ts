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

export const prCategories: Array<{ key: PullRequestCategory; label: string }> = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "draft", label: "Draft" },
  { key: "reviewed", label: "Reviewed" },
];

export function formatDate(value: string): string {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

export function readiness(pr: PullRequestSummary): { label: string; tone: string } {
  if (pr.isDraft) return { label: "Draft", tone: "text-zinc-400 bg-zinc-800/70 ring-zinc-700" };
  if (pr.voteSummary.rejected > 0) return { label: "Changes requested", tone: "text-red-400 bg-red-950/30 ring-red-900/60" };
  if (pr.voteSummary.approved > 0) return { label: "Reviewed", tone: "text-emerald-400 bg-emerald-950/30 ring-emerald-900/60" };
  return { label: "Needs review", tone: "text-yellow-400 bg-yellow-950/30 ring-yellow-900/60" };
}

export function insightReadinessTone(value: PullRequestInsightPreview["readiness"]): { label: string; tone: string } {
  if (value === "blocked") return { label: "Blocked", tone: "border-red-900/60 bg-red-950/30 text-red-300" };
  if (value === "needs_attention") return { label: "Needs attention", tone: "border-yellow-900/60 bg-yellow-950/30 text-yellow-300" };
  return { label: "Ready", tone: "border-emerald-900/60 bg-emerald-950/30 text-emerald-300" };
}

export function previewOperationDetails(result: PullRequestInsightPreview): string {
  return [
    `readiness=${result.readiness ?? "unknown"}`,
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
    `confidence=${result.contextConfidence ?? "unknown"}`,
    `findings=${result.findingCount}`,
    `discarded=${result.discardedFindings?.length ?? 0}`,
    `tokens=${result.tokensIn}/${result.tokensOut}`,
  ].join("; ");
}

export function mergeInsightArtifacts(items: PrInsightArtifact[]): PrInsightArtifact[] {
  const byId = new Map<string, PrInsightArtifact>();
  for (const item of items.sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"))) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.at || "0") - Date.parse(a.at || "0"));
}

export function projectLinkBranchScope(projectLink: { defaultBranch?: string } | null): string {
  return normalizeBranchName(projectLink?.defaultBranch);
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
