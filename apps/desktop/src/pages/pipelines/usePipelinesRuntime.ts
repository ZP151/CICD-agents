import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchProjectLinkPullRequests,
  runChatWorkflowAction,
  type ProjectLink,
  type PullRequestSummary,
} from "../../api.js";
import { paginateItems } from "../../components/PaginationControls.js";
import {
  loadStoredActiveProjectLinkId,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
} from "../../projectLinks.js";
import { extractPipelineRuns } from "./pipelineActions.js";
import {
  buildPipelineRows,
  countPipelineRows,
  rowMatchesFilter,
} from "./pipelineModel.js";
import type { PipelineInspectState, PipelineRow, PipelineStatusFilter } from "./pipelineTypes.js";

export function usePipelinesRuntime(projectLinks: ProjectLink[]) {
  const [projectLinkId, setProjectLinkId] = useState(() => loadStoredActiveProjectLinkId());
  const [filter, setFilter] = useState<PipelineStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [relatedPrs, setRelatedPrs] = useState<Record<string, PullRequestSummary[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inspectState, setInspectState] = useState<Record<string, PipelineInspectState>>({});

  useEffect(() => {
    if (projectLinks.length === 0) return;
    setProjectLinkId((current) => resolveActiveProjectLinkId(projectLinks, current));
  }, [projectLinks]);

  useEffect(() => {
    saveStoredActiveProjectLinkId(projectLinkId);
  }, [projectLinkId]);

  const selectedProjectLinks = useMemo(
    () => projectLinkId ? projectLinks.filter((projectLink) => projectLink.id === projectLinkId) : projectLinks,
    [projectLinkId, projectLinks],
  );

  const loadRelatedPullRequests = useCallback(async () => {
    if (selectedProjectLinks.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const entries = await Promise.all(selectedProjectLinks.map(async (projectLink) => {
        if (!projectLink.adoPipelineId) return [projectLink.id, []] as const;
        const active = await fetchProjectLinkPullRequests(projectLink.id, "active");
        return [projectLink.id, active] as const;
      }));
      setRelatedPrs(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectLinks]);

  useEffect(() => {
    void loadRelatedPullRequests();
  }, [loadRelatedPullRequests]);

  const rows = useMemo(() => buildPipelineRows(selectedProjectLinks, relatedPrs), [
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
  }, [filter, projectLinkId]);

  useEffect(() => {
    if (page > paginatedRows.pageCount) setPage(paginatedRows.pageCount);
  }, [page, paginatedRows.pageCount]);

  const inspectPipeline = useCallback(async (row: PipelineRow) => {
    if (!row.pipelineId) return;
    setInspectState((current) => ({ ...current, [row.projectLinkId]: { phase: "loading" } }));
    try {
      const result = await runChatWorkflowAction("inspect_pipeline", row.repoPath, row.projectLinkId, {
        pipelineId: Number(row.pipelineId),
      });
      setInspectState((current) => ({
        ...current,
        [row.projectLinkId]: { phase: "done", result, runs: extractPipelineRuns(result) },
      }));
    } catch (err) {
      setInspectState((current) => ({
        ...current,
        [row.projectLinkId]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, []);

  const triggerPipeline = useCallback(async (row: PipelineRow) => {
    if (!row.pipelineId) return;
    setInspectState((current) => ({ ...current, [row.projectLinkId]: { phase: "loading" } }));
    try {
      const result = await runChatWorkflowAction("trigger_pipeline", row.repoPath, row.projectLinkId, {
        pipelineId: Number(row.pipelineId),
        branch: row.defaultBranch,
      });
      setInspectState((current) => ({ ...current, [row.projectLinkId]: { phase: "approval", result } }));
    } catch (err) {
      setInspectState((current) => ({
        ...current,
        [row.projectLinkId]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, []);

  return {
    projectLinkId,
    setProjectLinkId,
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
    error,
    inspectState,
    loadRelatedPullRequests,
    inspectPipeline,
    triggerPipeline,
  };
}
