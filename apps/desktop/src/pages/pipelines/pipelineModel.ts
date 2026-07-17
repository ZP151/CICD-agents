import type {
  AdoDiscoveryOption,
  PipelineConnection,
  PipelineRunSummary,
  ProjectLink,
  PullRequestSummary,
} from "../../api.js";
import type {
  PipelineFilterOption,
  PipelineRow,
  PipelineStatusFilter,
  RunTone,
} from "./pipelineTypes.js";
import { formatSortableDate, parseSortableDate } from "../../safeDate.js";

export const pipelineFilters: PipelineFilterOption[] = [
  { key: "all", label: "All" },
  { key: "failed", label: "Failed" },
  { key: "running", label: "Running" },
  { key: "succeeded", label: "Succeeded" },
  { key: "saved", label: "Saved" },
  { key: "discovered", label: "Discovered" },
];

export function formatDate(value: string | undefined): string {
  return formatSortableDate(value);
}

export function runTone(run: PipelineRunSummary | undefined): RunTone {
  if (!run) {
    return {
      label: "No recent run",
      tone: "text-[rgb(var(--app-text-muted))] bg-[rgb(var(--app-surface-raised))] ring-[rgb(var(--app-border))]",
    };
  }
  if (run.state && run.state !== "completed") {
    return {
      label: run.state,
      tone: "text-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent-soft))] ring-[rgb(var(--app-accent))]/25",
    };
  }
  if (run.result === "succeeded") {
    return {
      label: "Succeeded",
      tone: "text-emerald-700 bg-emerald-500/10 ring-emerald-500/30 dark:text-emerald-300",
    };
  }
  if (run.result === "failed" || run.result === "canceled") {
    return {
      label: run.result,
      tone: "text-red-700 bg-red-500/10 ring-red-500/30 dark:text-red-300",
    };
  }
  return {
    label: run.result || run.state || "Run recorded",
    tone: "text-[rgb(var(--app-text-muted))] bg-[rgb(var(--app-surface-raised))] ring-[rgb(var(--app-border))]",
  };
}

export function rowMatchesFilter(row: PipelineRow, filter: PipelineStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "saved") return row.source === "saved";
  if (filter === "discovered") return row.source === "discovered";
  if (!row.latestRun) return false;
  if (filter === "running")
    return Boolean(row.latestRun.state && row.latestRun.state !== "completed");
  if (filter === "failed")
    return row.latestRun.result === "failed" || row.latestRun.result === "canceled";
  return row.latestRun.result === "succeeded";
}

export function pipelineProjectLinksCacheKey(
  projectLinks: Array<{
    id: string;
    repoPath?: string;
    defaultBranch?: string;
    targetBranch?: string;
    adoOrgUrl?: string;
    adoProject?: string;
    adoRepoName?: string;
    adoPipelineId?: string;
    adoPipelineName?: string;
    updatedAt?: number;
  }>,
): string {
  const normalizeBranch = (value: string | undefined) =>
    (value ?? "").trim().replace(/^refs\/heads\//, "").toLowerCase();
  return projectLinks
    .map((projectLink) => [
      projectLink.id,
      projectLink.repoPath ?? "",
      projectLink.adoOrgUrl ?? "",
      projectLink.adoProject ?? "",
      projectLink.adoRepoName ?? "",
      projectLink.adoPipelineId ?? "",
      projectLink.adoPipelineName ?? "",
      normalizeBranch(projectLink.defaultBranch),
      normalizeBranch(projectLink.targetBranch),
      String(projectLink.updatedAt ?? ""),
    ].join("\u001f"))
    .sort((a, b) => a.localeCompare(b))
    .join("\u001e");
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
    const runs = prs
      .map((pr) => pr.pipelineRun)
      .filter((run): run is PipelineRunSummary => Boolean(run));
    const savedConnections = connections.filter(
      (connection) => connection.projectLinkId === projectLink.id,
    );
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
  return rows.sort(
    (a, b) =>
      a.project.localeCompare(b.project) ||
      a.repository.localeCompare(b.repository) ||
      Number(b.source === "saved") - Number(a.source === "saved") ||
      a.pipelineName.localeCompare(b.pipelineName),
  );
}

export function countPipelineRows(rows: PipelineRow[]): Record<PipelineStatusFilter, number> {
  return pipelineFilters.reduce<Record<PipelineStatusFilter, number>>(
    (acc, item) => {
      acc[item.key] = rows.filter((row) => rowMatchesFilter(row, item.key)).length;
      return acc;
    },
    { all: 0, failed: 0, running: 0, succeeded: 0, saved: 0, discovered: 0 },
  );
}

function compareRunsNewestFirst(a: PipelineRunSummary, b: PipelineRunSummary): number {
  const left = parseSortableDate(b.finishedDate || b.createdDate);
  const right = parseSortableDate(a.finishedDate || a.createdDate);
  return left - right;
}

function latestRunForPipeline(
  runs: PipelineRunSummary[],
  pipelineId: string,
): PipelineRunSummary | undefined {
  const filtered = runs.filter(
    (run) =>
      run.url.includes(`definitionId=${pipelineId}`) ||
      run.url.includes(`pipelineId=${pipelineId}`),
  );
  return [...filtered].sort(compareRunsNewestFirst)[0];
}
