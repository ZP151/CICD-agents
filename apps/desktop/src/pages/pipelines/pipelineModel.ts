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
      tone: "text-[rgb(var(--app-accent-readable))] bg-[rgb(var(--app-accent-soft))] ring-[rgb(var(--app-accent))]/25",
    };
  }
  if (run.result === "succeeded") {
    return {
      label: "Succeeded",
      tone: "text-[rgb(var(--app-success))] bg-[rgb(var(--app-success-soft))] ring-[rgb(var(--app-success-border))]",
    };
  }
  if (run.result === "failed" || run.result === "canceled") {
    return {
      label: run.result,
      tone: "text-[rgb(var(--app-danger))] bg-[rgb(var(--app-danger-soft))] ring-[rgb(var(--app-danger-border))]",
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
    adoOrgUrl?: string;
    adoProject?: string;
    adoRepoName?: string;
    updatedAt?: number;
  }>,
): string {
  // V2 canonical (GAP-01): the cache key tracks the stable identity only;
  // legacy pipeline/branch fields never participate.
  return projectLinks
    .map((projectLink) => [
      projectLink.id,
      projectLink.repoPath ?? "",
      projectLink.adoOrgUrl ?? "",
      projectLink.adoProject ?? "",
      projectLink.adoRepoName ?? "",
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
  return dedupePipelineRows(rows).sort(
    (a, b) =>
      a.project.localeCompare(b.project) ||
      a.repository.localeCompare(b.repository) ||
      Number(b.source === "saved") - Number(a.source === "saved") ||
      a.pipelineName.localeCompare(b.pipelineName),
  );
}

export function dedupePipelineRows(rows: PipelineRow[]): PipelineRow[] {
  const byPipeline = new Map<string, PipelineRow>();
  for (const row of rows) {
    const key = pipelineIdentityKey(row);
    const existing = byPipeline.get(key);
    if (!existing) {
      byPipeline.set(key, row);
      continue;
    }
    byPipeline.set(key, mergePipelineRows(pickPreferredPipelineRow(existing, row), existing, row));
  }
  return [...byPipeline.values()];
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

function pipelineIdentityKey(row: PipelineRow): string {
  return [
    row.orgUrl.trim().toLowerCase().replace(/\/+$/, ""),
    row.project.trim().toLowerCase(),
    row.repository.trim().toLowerCase(),
    row.pipelineId.trim().toLowerCase(),
  ].join("\u001f");
}

function pickPreferredPipelineRow(left: PipelineRow, right: PipelineRow): PipelineRow {
  const score = (row: PipelineRow) =>
    Number(row.source === "saved") * 100 +
    Number(isHumanProjectLinkName(row.projectLinkName)) * 10 +
    Number(Boolean(row.latestRun)) * 5 +
    Number(Boolean(row.connectionId)) * 2;
  const leftScore = score(left);
  const rightScore = score(right);
  if (leftScore !== rightScore) return leftScore > rightScore ? left : right;
  return left.projectLinkName.localeCompare(right.projectLinkName) <= 0 ? left : right;
}

function isHumanProjectLinkName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && !normalized.startsWith("mp-live-") && !normalized.startsWith("test-");
}

function mergePipelineRows(preferred: PipelineRow, left: PipelineRow, right: PipelineRow): PipelineRow {
  const relatedPullRequests = dedupeRelatedPullRequests([
    ...left.relatedPullRequests,
    ...right.relatedPullRequests,
  ]);
  const latestRun = [left.latestRun, right.latestRun]
    .filter((run): run is PipelineRunSummary => Boolean(run))
    .sort(compareRunsNewestFirst)[0];
  return {
    ...preferred,
    latestRun,
    relatedPullRequests,
  };
}

function dedupeRelatedPullRequests(prs: PullRequestSummary[]): PullRequestSummary[] {
  return [...new Map(prs.map((pr) => [String(pr.id), pr])).values()];
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
