import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import {
  analyzePipelineEvidence,
  createPipelineConnection,
  discoverAdoProjectLinkOptions,
  fetchProjectLinkPullRequests,
  listPipelineConnections,
  runChatWorkflowAction,
  type AdoDiscoveryOption,
  type PipelineConnection,
  type ProjectLink,
  type PullRequestSummary,
} from "../../api.js";
import { paginateItems } from "../../components/PaginationControls.js";
import { extractPipelineRuns } from "./pipelineActions.js";
import {
  buildPipelineRows,
  countPipelineRows,
  rowMatchesFilter,
} from "./pipelineModel.js";
import type { PipelineInspectState, PipelineRow, PipelineStatusFilter } from "./pipelineTypes.js";

const ALL_PROJECTS = "";

export function usePipelinesRuntime(projectLinks: ProjectLink[]) {
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [filter, setFilter] = useState<PipelineStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [connections, setConnections] = useState<PipelineConnection[]>([]);
  const [discovered, setDiscovered] = useState<Record<string, AdoDiscoveryOption[]>>({});
  const [relatedPrs, setRelatedPrs] = useState<Record<string, PullRequestSummary[]>>({});
  const [loading, setLoading] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [inspectState, setInspectState] = useState<Record<string, PipelineInspectState>>({});

  const projectOptions = useMemo(() => {
    const names = projectLinks
      .map((projectLink) => projectLink.adoProject.trim())
      .filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [projectLinks]);

  useEffect(() => {
    if (projectFilter && !projectOptions.includes(projectFilter)) setProjectFilter(ALL_PROJECTS);
  }, [projectFilter, projectOptions]);

  const selectedProjectLinks = useMemo(
    () => projectFilter
      ? projectLinks.filter((projectLink) => projectLink.adoProject === projectFilter)
      : projectLinks,
    [projectFilter, projectLinks],
  );

  const loadConnections = useCallback(async () => {
    setError(null);
    setNotice(null);
    try {
      setConnections(await listPipelineConnections());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const loadRelatedPullRequests = useCallback(async () => {
    if (selectedProjectLinks.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const entries = await Promise.all(selectedProjectLinks.map(async (projectLink) => {
        const active = await fetchProjectLinkPullRequests(projectLink.id, "active").catch(() => []);
        return [projectLink.id, active] as const;
      }));
      setRelatedPrs(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectLinks]);

  const discoverPipelines = useCallback(async () => {
    const discoverable = selectedProjectLinks.filter((projectLink) =>
      projectLink.adoOrgUrl.trim() && projectLink.adoProject.trim() && projectLink.adoRepoName.trim()
    );
    if (discoverable.length === 0) return;
    setDiscovering(true);
    setError(null);
    setNotice(null);
    try {
      const entries = await Promise.all(discoverable.map(async (projectLink) => {
        const result = await discoverAdoProjectLinkOptions("pipelines", projectLink);
        return [projectLink.id, result.items] as const;
      }));
      setDiscovered((current) => ({ ...current, ...Object.fromEntries(entries) }));
    } catch (err) {
      setNotice(discoveryNoticeFromError(err));
    } finally {
      setDiscovering(false);
    }
  }, [selectedProjectLinks]);

  useEffect(() => {
    void loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    void loadRelatedPullRequests();
  }, [loadRelatedPullRequests]);

  useEffect(() => {
    void discoverPipelines();
  }, [discoverPipelines]);

  const rows = useMemo(() => buildPipelineRows(selectedProjectLinks, connections, discovered, relatedPrs), [
    connections,
    discovered,
    relatedPrs,
    selectedProjectLinks,
  ]);
  const counts = useMemo(() => countPipelineRows(rows), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => rowMatchesFilter(row, filter)), [
    filter,
    rows,
  ]);
  const paginatedRows = useMemo(() => paginateItems(filteredRows, page, pageSize), [
    filteredRows,
    page,
    pageSize,
  ]);

  useEffect(() => {
    setPage(1);
  }, [filter, projectFilter]);

  useEffect(() => {
    if (page > paginatedRows.pageCount) setPage(paginatedRows.pageCount);
  }, [page, paginatedRows.pageCount]);

  const savePipeline = useCallback(async (row: PipelineRow) => {
    setError(null);
    try {
      await createPipelineConnection({
        projectLinkId: row.projectLinkId,
        pipelineId: row.pipelineId,
        pipelineName: row.pipelineName,
        purpose: "ci",
        isDefault: true,
      });
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [loadConnections]);

  const inspectPipeline = useCallback(async (row: PipelineRow) => inspectPipelineRow(row, setInspectState), []);

  const triggerPipeline = useCallback(async (row: PipelineRow) => {
    setInspectState((current) => ({ ...current, [rowKey(row)]: { phase: "loading" } }));
    try {
      const result = await runChatWorkflowAction("trigger_pipeline", row.repoPath, row.projectLinkId, {
        pipelineId: Number(row.pipelineId),
        branch: row.defaultBranch,
      });
      setInspectState((current) => ({ ...current, [rowKey(row)]: { phase: "approval", result } }));
    } catch (err) {
      setInspectState((current) => ({
        ...current,
        [rowKey(row)]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, []);

  const analyzePipeline = useCallback(async (row: PipelineRow) => {
    const result = await inspectPipelineRow(row, setInspectState);
    const runs = extractPipelineRuns(result);
    const localAnalysis = summarizePipelineInspection(row, result, runs);
    setInspectState((current) => ({
      ...current,
      [rowKey(row)]: { phase: "analyzing", result, runs, analysis: localAnalysis },
    }));
    try {
      const analysis = await analyzePipelineEvidence({
        pipelineId: row.pipelineId,
        pipelineName: row.pipelineName,
        project: row.project,
        repository: row.repository,
        summary: result.summary,
        localAnalysis,
        runs,
        artifacts: result.artifacts ?? [],
      });
      setInspectState((current) => ({
        ...current,
        [rowKey(row)]: { phase: "analysis_done", result, runs, analysis: analysis.analysis || localAnalysis },
      }));
    } catch {
      setInspectState((current) => ({
        ...current,
        [rowKey(row)]: { phase: "analysis_done", result, runs, analysis: localAnalysis },
      }));
    }
  }, []);

  return {
    projectFilter,
    setProjectFilter,
    projectOptions,
    filter,
    setFilter,
    page,
    setPage,
    pageSize,
    setPageSize,
    rows,
    counts,
    filteredRows,
    paginatedRows,
    loading,
    discovering,
    error,
    notice,
    inspectState,
    loadConnections,
    loadRelatedPullRequests,
    discoverPipelines,
    inspectPipeline,
    triggerPipeline,
    analyzePipeline,
    savePipeline,
  };
}

function discoveryNoticeFromError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/CrossPlatformLockError|IdentityService|lockfile|oauth|authentication|credential/i.test(message)) {
    return "Pipeline discovery could not refresh Azure DevOps credentials right now. Existing saved connections remain usable; sign in again or retry discovery after the credential lock clears.";
  }
  return message;
}

async function inspectPipelineRow(
  row: PipelineRow,
  setInspectState: Dispatch<SetStateAction<Record<string, PipelineInspectState>>>,
) {
  setInspectState((current) => ({ ...current, [rowKey(row)]: { phase: "loading" } }));
  try {
    const result = await runChatWorkflowAction("inspect_pipeline", row.repoPath, row.projectLinkId, {
      pipelineId: Number(row.pipelineId),
    });
    const runs = extractPipelineRuns(result);
    setInspectState((current) => ({
      ...current,
      [rowKey(row)]: { phase: "done", result, runs },
    }));
    return result;
  } catch (err) {
    setInspectState((current) => ({
      ...current,
      [rowKey(row)]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
    }));
    throw err;
  }
}

export function rowKey(row: Pick<PipelineRow, "projectLinkId" | "pipelineId">): string {
  return `${row.projectLinkId}:${row.pipelineId}`;
}

function summarizePipelineInspection(
  row: PipelineRow,
  result: Awaited<ReturnType<typeof runChatWorkflowAction>>,
  runs: ReturnType<typeof extractPipelineRuns>,
): string {
  const failed = runs.filter((run) => /failed|canceled/i.test(`${run.result} ${run.state}`));
  const running = runs.filter((run) => run.state && run.state !== "completed");
  const succeeded = runs.filter((run) => run.result === "succeeded");
  const latest = runs[0];
  const artifactCount = result.artifacts?.length ?? 0;
  const risk = failed.length > 0 ? "high" : running.length > 0 ? "medium" : "low";
  return [
    `Status: ${result.summary || `Pipeline #${row.pipelineId} inspected.`}`,
    `Risk: ${risk}`,
    `Runs inspected: ${runs.length || "none returned"} (${succeeded.length} succeeded, ${failed.length} failed/canceled, ${running.length} running)`,
    latest ? `Latest run: ${latest.name || latest.id} - ${latest.state || "unknown"} / ${latest.result || "unknown"}` : "Latest run: unavailable",
    artifactCount > 0
      ? `Evidence: ${artifactCount} failure artifact(s) or log/timeline excerpts captured.`
      : "Evidence: no failure artifacts captured from the latest inspected runs.",
    failed.length > 0
      ? "Next action: open the failure artifact/log excerpt, identify the failing timeline record, then rerun after the fix."
      : "Next action: save this connection if it is the intended CI pipeline; trigger only when you want a new run.",
  ].join("\n");
}
