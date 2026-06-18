import type { PipelineRunSummary, ProjectLink, PullRequestSummary } from "../../api.js";
import type { PipelineFilterOption, PipelineRow, PipelineStatusFilter, RunTone } from "./pipelineTypes.js";

export const pipelineFilters: PipelineFilterOption[] = [
  { key: "all", label: "All" },
  { key: "failed", label: "Failed" },
  { key: "running", label: "Running" },
  { key: "succeeded", label: "Succeeded" },
  { key: "not_configured", label: "Not configured" },
];

export function formatDate(value: string | undefined): string {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

export function runTone(run: PipelineRunSummary | undefined): RunTone {
  if (!run) return { label: "No recent run", tone: "text-zinc-500 bg-zinc-800/60 ring-zinc-700/50" };
  if (run.state && run.state !== "completed") {
    return { label: run.state, tone: "text-blue-400 bg-blue-950/20 ring-blue-900/50" };
  }
  if (run.result === "succeeded") {
    return { label: "Succeeded", tone: "text-emerald-400 bg-emerald-950/20 ring-emerald-900/50" };
  }
  if (run.result === "failed" || run.result === "canceled") {
    return { label: run.result, tone: "text-red-400 bg-red-950/30 ring-red-900/60" };
  }
  return { label: run.result || run.state || "Unknown", tone: "text-zinc-400 bg-zinc-800/60 ring-zinc-700/50" };
}

export function rowMatchesFilter(row: PipelineRow, filter: PipelineStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "not_configured") return !row.pipelineId;
  if (!row.latestRun) return false;
  if (filter === "running") return Boolean(row.latestRun.state && row.latestRun.state !== "completed");
  if (filter === "failed") return row.latestRun.result === "failed" || row.latestRun.result === "canceled";
  return row.latestRun.result === "succeeded";
}

export function buildPipelineRows(
  projectLinks: ProjectLink[],
  relatedPrs: Record<string, PullRequestSummary[]>,
): PipelineRow[] {
  return projectLinks.map((projectLink) => {
    const prs = relatedPrs[projectLink.id] ?? [];
    const runs = prs.map((pr) => pr.pipelineRun).filter((run): run is PipelineRunSummary => Boolean(run));
    const latestRun = [...runs].sort(compareRunsNewestFirst)[0];
    return {
      projectLinkId: projectLink.id,
      projectLinkName: projectLink.name,
      repoPath: projectLink.repoPath,
      repository: projectLink.adoRepoName,
      project: projectLink.adoProject,
      orgUrl: projectLink.adoOrgUrl,
      pipelineId: projectLink.adoPipelineId,
      pipelineName: projectLink.adoPipelineName,
      defaultBranch: projectLink.defaultBranch,
      targetBranch: projectLink.targetBranch,
      latestRun,
      relatedPullRequests: prs,
    };
  });
}

export function countPipelineRows(rows: PipelineRow[]): Record<PipelineStatusFilter, number> {
  return pipelineFilters.reduce<Record<PipelineStatusFilter, number>>((acc, item) => {
    acc[item.key] = rows.filter((row) => rowMatchesFilter(row, item.key)).length;
    return acc;
  }, { all: 0, failed: 0, running: 0, succeeded: 0, not_configured: 0 });
}

function compareRunsNewestFirst(a: PipelineRunSummary, b: PipelineRunSummary): number {
  const left = Date.parse(b.finishedDate || b.createdDate || "0");
  const right = Date.parse(a.finishedDate || a.createdDate || "0");
  return left - right;
}
