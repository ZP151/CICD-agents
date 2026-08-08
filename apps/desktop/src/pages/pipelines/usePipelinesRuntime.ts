import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  analyzePipelineEvidence,
  createPipelineConnection,
  discoverAdoProjectLinkOptions,
  fetchProjectLinkPullRequests,
  listPipelineConnections,
  runChatWorkflowAction,
  type AdoDiscoveryOption,
  type ChatWorkflowActionResult,
  type PipelineConnection,
  type ProjectLink,
  type PullRequestSummary,
} from "../../api.js";
import { CHAT_HANDOFF_KEY } from "../../checkpointHandoff.js";
import { buildPipelineChatHandoffDraft } from "../../checkpointHandoff.js";
import { saveApprovalHandoff } from "../chat/approvalHandoff.js";
import { paginateItems } from "../../components/PaginationControls.js";
import { extractPipelineRuns } from "./pipelineActions.js";
import {
  buildPipelineRows,
  countPipelineRows,
  pipelineProjectLinksCacheKey,
  rowMatchesFilter,
} from "./pipelineModel.js";
import type { PipelineInspectState, PipelineRow, PipelineStatusFilter } from "./pipelineTypes.js";

const ALL_PROJECTS = "";

export function usePipelinesRuntime(projectLinks: ProjectLink[]) {
  const navigate = useNavigate();
  const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
  const [filter, setFilter] = useState<PipelineStatusFilter>("all");
  const [inspectorRun, setInspectorRun] = useState<{
    buildId: number;
    definitionId: number;
    projectLinkId: string;
    branch: string;
    repositoryId: string;
  } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [localError, setLocalError] = useState<string | null>(null);
  const [inspectState, setInspectState] = useState<Record<string, PipelineInspectState>>({});
  const queryClient = useQueryClient();

  const projectOptions = useMemo(() => {
    const names = projectLinks.map((projectLink) => projectLink.adoProject.trim()).filter(Boolean);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b));
  }, [projectLinks]);

  useEffect(() => {
    if (projectFilter && !projectOptions.includes(projectFilter)) setProjectFilter(ALL_PROJECTS);
  }, [projectFilter, projectOptions]);

  const selectedProjectLinks = useMemo(
    () =>
      projectFilter
        ? projectLinks.filter((projectLink) => projectLink.adoProject === projectFilter)
        : projectLinks,
    [projectFilter, projectLinks],
  );

  const selectedProjectLinkKey = useMemo(
    () => pipelineProjectLinksCacheKey(selectedProjectLinks),
    [selectedProjectLinks],
  );

  const connectionsQuery = useQuery<PipelineConnection[]>({
    queryKey: ["pipelineConnections"],
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous,
    queryFn: () => listPipelineConnections(),
  });

  const relatedPrsQuery = useQuery({
    queryKey: ["pipelineRelatedPrs", selectedProjectLinkKey],
    enabled: selectedProjectLinks.length > 0,
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      if (!Array.isArray(previousKey)) return undefined;
      return previousKey[1] === selectedProjectLinkKey ? previous : undefined;
    },
    queryFn: async () => {
      const entries = await Promise.all(
        selectedProjectLinks.map(async (projectLink) => {
          const active = await fetchProjectLinkPullRequests(projectLink.id, "active").catch(
            () => [],
          );
          return [projectLink.id, active] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, PullRequestSummary[]>;
    },
  });

  const discoverableProjectLinks = useMemo(
    () =>
      selectedProjectLinks.filter(
        (projectLink) =>
          projectLink.adoOrgUrl.trim() &&
          projectLink.adoProject.trim() &&
          projectLink.adoRepoName.trim(),
      ),
    [selectedProjectLinks],
  );

  const discoveryQuery = useQuery({
    queryKey: ["pipelineDiscovery", selectedProjectLinkKey],
    enabled: discoverableProjectLinks.length > 0,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous, previousQuery) => {
      const previousKey = previousQuery?.queryKey;
      if (!Array.isArray(previousKey)) return undefined;
      return previousKey[1] === selectedProjectLinkKey ? previous : undefined;
    },
    queryFn: async () => {
      const entries = await Promise.all(
        discoverableProjectLinks.map(async (projectLink) => {
          const result = await discoverAdoProjectLinkOptions("pipelines", projectLink);
          return [projectLink.id, result.items] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<string, AdoDiscoveryOption[]>;
    },
    retry: false,
  });

  const loadConnections = useCallback(async () => {
    setLocalError(null);
    await connectionsQuery.refetch();
  }, [connectionsQuery]);

  const loadRelatedPullRequests = useCallback(async () => {
    setLocalError(null);
    await relatedPrsQuery.refetch();
  }, [relatedPrsQuery]);

  const discoverPipelines = useCallback(async () => {
    setLocalError(null);
    await discoveryQuery.refetch();
  }, [discoveryQuery]);

  const connections = connectionsQuery.data ?? [];
  const relatedPrs = relatedPrsQuery.data ?? {};
  const discovered = discoveryQuery.data ?? {};
  const loading = relatedPrsQuery.isLoading && !relatedPrsQuery.data;
  const discovering = discoveryQuery.isFetching;
  const hasAnyPipelineQueryData =
    hasCachedQueryData(queryClient, ["pipelineConnections"]) ||
    hasCachedQueryData(queryClient, ["pipelineRelatedPrs", selectedProjectLinkKey]) ||
    hasCachedQueryData(queryClient, ["pipelineDiscovery", selectedProjectLinkKey]);
  const error =
    localError ??
    (connectionsQuery.error instanceof Error ? connectionsQuery.error.message : null) ??
    (relatedPrsQuery.error instanceof Error ? relatedPrsQuery.error.message : null);
  const notice = discoveryQuery.error ? discoveryNoticeFromError(discoveryQuery.error) : null;

  const rows = useMemo(
    () => buildPipelineRows(selectedProjectLinks, connections, discovered, relatedPrs),
    [connections, discovered, relatedPrs, selectedProjectLinks],
  );
  const firstDiscoveryLoading =
    rows.length === 0 &&
    !notice &&
    !hasAnyPipelineQueryData &&
    (loading ||
      connectionsQuery.isLoading ||
      discoveryQuery.isLoading ||
      (discovering && !discoveryQuery.data));
  const counts = useMemo(() => countPipelineRows(rows), [rows]);
  const filteredRows = useMemo(
    () => rows.filter((row) => rowMatchesFilter(row, filter)),
    [filter, rows],
  );
  const paginatedRows = useMemo(
    () => paginateItems(filteredRows, page, pageSize),
    [filteredRows, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [filter, projectFilter]);

  useEffect(() => {
    if (page > paginatedRows.pageCount) setPage(paginatedRows.pageCount);
  }, [page, paginatedRows.pageCount]);

  const savePipeline = useCallback(
    async (row: PipelineRow) => {
      setLocalError(null);
      try {
        await createPipelineConnection({
          projectLinkId: row.projectLinkId,
          pipelineId: row.pipelineId,
          pipelineName: row.pipelineName,
          purpose: "ci",
          isDefault: true,
        });
        await queryClient.invalidateQueries({ queryKey: ["pipelineConnections"] });
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : String(err));
      }
    },
    [queryClient],
  );

  const inspectPipeline = useCallback(
    async (row: PipelineRow) => inspectPipelineRow(row, setInspectState),
    [],
  );

  const triggerPipeline = useCallback(async (row: PipelineRow) => {
    setInspectState((current) => ({ ...current, [rowKey(row)]: { phase: "loading" } }));
    try {
      const result = await runChatWorkflowAction(
        "trigger_pipeline",
        row.repoPath,
        row.projectLinkId,
        {
          pipelineId: Number(row.pipelineId) || undefined,
          branch: row.defaultBranch,
        },
      );
      if (!result.ok && result.failure) {
        const failure = result.failure;
        setInspectState((current) => ({
          ...current,
          [rowKey(row)]: { phase: "target_failure", result, failure },
        }));
        return;
      }
      setInspectState((current) => ({ ...current, [rowKey(row)]: { phase: "approval", result } }));
      // MP-006: a workspace trigger creates its own chat session with a stored
      // approval proposal. Hand the session over so "Open Chat approval"
      // rehydrates the pending card instead of opening a blank chat.
      if (result.ok && result.sessionId && result.workflowState?.pendingApproval) {
        saveApprovalHandoff({
          sessionId: result.sessionId,
          repoPath: result.repoPath,
          activeProjectLinkId: row.projectLinkId,
          workflowState: result.workflowState,
        });
      }
    } catch (err) {
      setInspectState((current) => ({
        ...current,
        [rowKey(row)]: {
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  }, []);

  /**
   * RA-044/RA-047: the user picks one candidate from an ambiguous result;
   * the workflow retries with the explicit ID. RA-023: explicit Open in Chat
   * handoff carries a source reference and never copies the page payload.
   */
  const selectPipelineCandidate = useCallback(async (row: PipelineRow, candidateId: number) => {
    setInspectState((current) => ({ ...current, [rowKey(row)]: { phase: "loading" } }));
    try {
      const result = await runChatWorkflowAction(
        "inspect_pipeline",
        row.repoPath,
        row.projectLinkId,
        { pipelineId: candidateId },
      );
      if (!result.ok && result.failure) {
        const failure = result.failure;
        setInspectState((current) => ({
          ...current,
          [rowKey(row)]: { phase: "target_failure", result, failure },
        }));
        return;
      }
      const runs = extractPipelineRuns(result);
      setInspectState((current) => ({
        ...current,
        [rowKey(row)]: { phase: "done", result, runs },
      }));
    } catch (err) {
      setInspectState((current) => ({
        ...current,
        [rowKey(row)]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, []);

  const openRunInspector = useCallback((row: PipelineRow) => {
    const run = row.latestRun;
    if (!run) return;
    setInspectorRun({
      buildId: run.id,
      definitionId: Number(row.pipelineId ?? 0),
      projectLinkId: row.projectLinkId,
      branch: run.sourceBranch,
      repositoryId: row.repository,
    });
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
        [rowKey(row)]: {
          phase: "analysis_done",
          result,
          runs,
          analysis: analysis.analysis || localAnalysis,
        },
      }));
    } catch (err) {
      setInspectState((current) => ({
        ...current,
        [rowKey(row)]: {
          phase: "analysis_error",
          result,
          runs,
          analysis: localAnalysis,
          message: err instanceof Error ? err.message : String(err),
        },
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
    firstDiscoveryLoading,
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
    selectPipelineCandidate,
    inspectorRun,
    openRunInspector,
    setInspectorRun,
  };
}

function discoveryNoticeFromError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /CrossPlatformLockError|IdentityService|lockfile|oauth|authentication|credential/i.test(message)
  ) {
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
    const result = await runChatWorkflowAction(
      "inspect_pipeline",
      row.repoPath,
      row.projectLinkId,
      {
        pipelineId: Number(row.pipelineId) || undefined,
      },
    );
    // MP-010: typed target-resolution failures stay on the page with their
    // own recovery surface instead of a generic error line.
    if (!result.ok && result.failure) {
      const failure = result.failure;
      setInspectState((current) => ({
        ...current,
        [rowKey(row)]: { phase: "target_failure", result, failure },
      }));
      return result;
    }
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

export function rowKey(row: Pick<PipelineRow, "projectLinkId" | "pipelineId" | "repoPath" | "orgUrl" | "project" | "repository" | "defaultBranch" | "targetBranch">): string {
  return [
    row.projectLinkId,
    row.pipelineId,
    row.repoPath,
    row.orgUrl,
    row.project,
    row.repository,
    row.defaultBranch,
    row.targetBranch,
  ].join("\u001f");
}

function hasCachedQueryData(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: unknown[],
): boolean {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey })
    .some((query) => query.state.data !== undefined);
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
    latest
      ? `Latest run: ${latest.name || latest.id} - ${latest.state || "state not available"} / ${latest.result || "result not available"}`
      : "Latest run: unavailable",
    artifactCount > 0
      ? `Evidence: ${artifactCount} failure artifact(s) or log/timeline excerpts captured.`
      : "Evidence: no failure artifacts captured from the latest inspected runs.",
    failed.length > 0
      ? "Next action: open the failure artifact/log excerpt, identify the failing timeline record, then rerun after the fix."
      : "Next action: save this connection if it is the intended CI pipeline; trigger only when you want a new run.",
  ].join("\n");
}
