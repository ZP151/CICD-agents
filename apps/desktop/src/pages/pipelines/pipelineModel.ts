import type {
  AdoDiscoveryOption,
  PipelineConnection,
  PipelineRunSummary,
  ProjectLink,
  PullRequestSummary,
} from "../../api.js";
import type { PipelineFilterOption, PipelineRow, PipelineStatusFilter, RunTone } from "./pipelineTypes.js";

export const pipelineFilters: PipelineFilterOption[] = [
  { key: "all", label: "All" },
  { key: "failed", label: "Failed" },
  { key: "running", label: "Running" },
  { key: "succeeded", label: "Succeeded" },
  { key: "saved", label: "Saved" },
  { key: "discovered", label: "Discovered" },
];

export function formatDate(value: string | undefined): string {
  if (!value) return "";
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
  return { label: run.result || run.state || "Run recorded", tone: "text-zinc-400 bg-zinc-800/60 ring-zinc-700/50" };
}

export function rowMatchesFilter(row: PipelineRow, filter: PipelineStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "saved") return row.source === "saved";
  if (filter === "discovered") return row.source === "discovered";
  if (!row.latestRun) return false;
  if (filter === "running") return Boolean(row.latestRun.state && row.latestRun.state !== "completed");
  if (filter === "failed") return row.latestRun.result === "failed" || row.latestRun.result === "canceled";
  return row.latestRun.result === "succeeded";
}

export function buildPipelineRows(
  projectLinks: ProjectLink[],
  connections: PipelineConnection[],
  discovered: Record<string, AdoDiscoveryOption[]>,
  relatedPrs: Record<string, PullRequestSummary[]>,
): PipelineRow[] {
  const rows: PipelineRow[] = [];
  for (const projectLink of projectLinks) {
    const prs = relatedPrs[projectLink.id] ?? [];
    const runs = prs.map((pr) => pr.pipelineRun).filter((run): run is PipelineRunSummary => Boolean(run));
    const savedConnections = connections.filter((connection) => connection.projectLinkId === projectLink.id);
    for (const connection of savedConnections) {
      const latestRun = latestRunForPipeline(runs, connection.pipelineId);
      rows.push({
        projectLinkId: projectLink.id,
        projectLinkName: projectLink.name,
        connectionId: connection.id,
        source: "saved",
        repoPath: projectLink.repoPath,
        repository: projectLink.adoRepoName,
        project: projectLink.adoProject,
        orgUrl: projectLink.adoOrgUrl,
        pipelineId: connection.pipelineId,
        pipelineName: connection.pipelineName,
        defaultBranch: projectLink.defaultBranch,
        targetBranch: projectLink.targetBranch,
        latestRun,
        relatedPullRequests: prs,
        connection,
      });
    }

    const savedIds = new Set(savedConnections.map((connection) => connection.pipelineId));
    for (const option of discovered[projectLink.id] ?? []) {
      if (savedIds.has(option.id)) continue;
      rows.push({
        projectLinkId: projectLink.id,
        projectLinkName: projectLink.name,
        source: "discovered",
        repoPath: projectLink.repoPath,
        repository: projectLink.adoRepoName,
        project: projectLink.adoProject,
        orgUrl: projectLink.adoOrgUrl,
        pipelineId: option.id,
        pipelineName: option.name,
        defaultBranch: projectLink.defaultBranch,
        targetBranch: projectLink.targetBranch,
        latestRun: undefined,
        relatedPullRequests: prs,
      });
    }
  }
  return rows.sort((a, b) =>
    a.project.localeCompare(b.project) ||
    a.repository.localeCompare(b.repository) ||
    Number(b.source === "saved") - Number(a.source === "saved") ||
    a.pipelineName.localeCompare(b.pipelineName)
  );
}

export function countPipelineRows(rows: PipelineRow[]): Record<PipelineStatusFilter, number> {
  return pipelineFilters.reduce<Record<PipelineStatusFilter, number>>((acc, item) => {
    acc[item.key] = rows.filter((row) => rowMatchesFilter(row, item.key)).length;
    return acc;
  }, { all: 0, failed: 0, running: 0, succeeded: 0, saved: 0, discovered: 0 });
}

function compareRunsNewestFirst(a: PipelineRunSummary, b: PipelineRunSummary): number {
  const left = Date.parse(b.finishedDate || b.createdDate || "0");
  const right = Date.parse(a.finishedDate || a.createdDate || "0");
  return left - right;
}

function latestRunForPipeline(runs: PipelineRunSummary[], pipelineId: string): PipelineRunSummary | undefined {
  const filtered = runs.filter((run) =>
    run.url.includes(`definitionId=${pipelineId}`) || run.url.includes(`pipelineId=${pipelineId}`)
  );
  return [...filtered].sort(compareRunsNewestFirst)[0];
}
