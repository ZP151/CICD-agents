import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppData } from "../../App.js";
import { paginateItems } from "../../components/PaginationControls.js";
import {
  fetchProjectLinkPrInsightArtifacts,
  fetchProjectLinkPullRequestContext,
  fetchProjectLinkPullRequests,
} from "../../api.js";
import {
  listPrInsightArtifacts,
  type PrInsightArtifact,
} from "../../prInsightArtifacts.js";
import {
  loadStoredActiveProjectLinkId,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
} from "../../projectLinks.js";
import {
  dedupePullRequests,
  matchesProjectLinkBranch,
  mergeInsightArtifacts,
  prCategories,
  prMatchesCategory,
  projectLinkBranchScope,
} from "./pullRequestViewModel.js";
import {
  pullRequestRuntimeKey,
  type ContextState,
  type DisplayPullRequest,
  type PreviewState,
  type PullRequestCategory,
  type QueueState,
} from "./pullRequestTypes.js";
import { usePullRequestActions } from "./usePullRequestActions.js";
import { usePullRequestHandoff } from "./usePullRequestHandoff.js";

interface PullRequestsQueryData {
  prs: DisplayPullRequest[];
  warnings: string[];
}

type PullRequestsAggregateResult =
  | { ok: true; prs: DisplayPullRequest[] }
  | { ok: false; projectLinkName: string; message: string };

const PULL_REQUEST_LIST_TIMEOUT_MS = 3_500;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function usePullRequestsRuntime() {
  const { projectLinks, projectLinksLoading } = useAppData();
  const [projectLinkId, setProjectLinkId] = useState(() => loadStoredActiveProjectLinkId());
  const [status, setStatus] = useState("active");
  const [category, setCategory] = useState<PullRequestCategory>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedPrKey, setExpandedPrKey] = useState<string | null>(null);
  const [highlightedPrKey, setHighlightedPrKey] = useState<string | null>(null);
  const [contexts, setContexts] = useState<Record<string, ContextState>>({});
  const [queueing, setQueueing] = useState<Record<string, QueueState>>({});
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const queryClient = useQueryClient();

  const selectedProjectLink = useMemo(
    () => projectLinks.find((projectLink) => projectLink.id === projectLinkId) ?? null,
    [projectLinks, projectLinkId],
  );
  const branchScope = projectLinkBranchScope(selectedProjectLink);
  const projectLinkForPullRequest = useCallback((pr: DisplayPullRequest) => {
    return pr.sourceProjectLinkId || projectLinkId;
  }, [projectLinkId]);

  const pullRequestsQuery = useQuery<PullRequestsQueryData>({
    queryKey: ["pullRequests", projectLinkId || "all", status, projectLinks.map((item) => item.id).join("|")],
    enabled: Boolean(projectLinkId || projectLinks.length > 0),
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    retry: false,
    retryOnMount: false,
    queryFn: async () => {
      if (projectLinkId) {
        const nextPrs = (await withTimeout(
          fetchProjectLinkPullRequests(projectLinkId, status),
          PULL_REQUEST_LIST_TIMEOUT_MS,
          selectedProjectLink?.name ?? "Pull request list",
        ))
          .filter((pr) => matchesProjectLinkBranch(pr, selectedProjectLink))
          .map((pr) => ({
            ...pr,
            sourceProjectLinkId: projectLinkId,
            sourceProjectLinkName: selectedProjectLink?.name,
          }));
        return { prs: nextPrs, warnings: [] };
      }

      const results = await Promise.all(projectLinks.map(async (projectLink): Promise<PullRequestsAggregateResult> => {
        try {
          const items = await withTimeout(
            fetchProjectLinkPullRequests(projectLink.id, status),
            PULL_REQUEST_LIST_TIMEOUT_MS,
            projectLink.name,
          );
          return {
            ok: true,
            prs: items.map((pr) => ({
              ...pr,
              sourceProjectLinkId: projectLink.id,
              sourceProjectLinkName: projectLink.name,
            })),
          };
        } catch (error) {
          return {
            ok: false,
            projectLinkName: projectLink.name,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }));

      const successful = results.filter((item): item is Extract<PullRequestsAggregateResult, { ok: true }> => item.ok);
      const warnings = results
        .filter((item): item is Extract<PullRequestsAggregateResult, { ok: false }> => !item.ok)
        .map((item) => `${item.projectLinkName}: ${item.message}`);
      return {
        prs: dedupePullRequests(successful.flatMap((item) => item.prs)),
        warnings,
      };
    },
  });

  const prs = pullRequestsQuery.data?.prs ?? [];
  const pullRequestWarnings = pullRequestsQuery.data?.warnings ?? [];
  const loading = pullRequestsQuery.isLoading;
  const refreshing = pullRequestsQuery.isFetching && !pullRequestsQuery.isLoading;
  const error = pullRequestsQuery.error instanceof Error ? pullRequestsQuery.error.message : null;

  const insightArtifactsQuery = useQuery<PrInsightArtifact[]>({
    queryKey: ["prInsightArtifacts", projectLinkId || "all"],
    staleTime: 45_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      if (!projectLinkId) return listPrInsightArtifacts();
      const local = listPrInsightArtifacts(projectLinkId);
      const remote = await fetchProjectLinkPrInsightArtifacts(projectLinkId).catch(() => []);
      return mergeInsightArtifacts([...(remote as PrInsightArtifact[]), ...local]);
    },
  });
  const insightArtifacts = insightArtifactsQuery.data ?? [];

  const onInsightArtifactSaved = useCallback((artifact: PrInsightArtifact, actionProjectLinkId: string) => {
    const mergeArtifact = (current: PrInsightArtifact[] | undefined, fallbackProjectLinkId?: string) => (
      mergeInsightArtifacts([artifact, ...(current ?? listPrInsightArtifacts(fallbackProjectLinkId))])
    );
    queryClient.setQueryData<PrInsightArtifact[]>(
      ["prInsightArtifacts", actionProjectLinkId || "all"],
      (current) => mergeArtifact(current, actionProjectLinkId),
    );
    if (!projectLinkId || projectLinkId === actionProjectLinkId) {
      queryClient.setQueryData<PrInsightArtifact[]>(
        ["prInsightArtifacts", projectLinkId || "all"],
        (current) => mergeArtifact(current, projectLinkId || undefined),
      );
    }
    void queryClient.invalidateQueries({ queryKey: ["prInsightArtifacts", actionProjectLinkId || "all"] });
  }, [projectLinkId, queryClient]);

  const categoryCounts = useMemo(() => {
    return prCategories.reduce<Record<PullRequestCategory, number>>((acc, item) => {
      acc[item.key] = prs.filter((pr) => prMatchesCategory(pr, item.key)).length;
      return acc;
    }, {
      all: 0,
      attention: 0,
      draft: 0,
      reviewed: 0,
    });
  }, [prs]);

  const filteredPrs = useMemo(
    () => prs.filter((pr) => prMatchesCategory(pr, category)),
    [category, prs],
  );

  const paginatedPrs = useMemo(
    () => paginateItems(filteredPrs, page, pageSize),
    [filteredPrs, page, pageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [category, projectLinkId, status]);

  useEffect(() => {
    if (page > paginatedPrs.pageCount) setPage(paginatedPrs.pageCount);
  }, [page, paginatedPrs.pageCount]);

  const {
    handleQueueForReview,
    handlePreviewInsight,
    openSavedInsightInChat,
  } = usePullRequestActions({
    projectLinkId,
    projectLinks,
    selectedProjectLink,
    projectLinkForPullRequest,
    setQueueing,
    setPreviews,
    onInsightArtifactSaved,
  });

  const toggleContext = useCallback(async (pr: DisplayPullRequest) => {
    const actionProjectLinkId = projectLinkForPullRequest(pr);
    if (!actionProjectLinkId) return;
    const prKey = pullRequestRuntimeKey(pr);
    const nextExpanded = expandedPrKey === prKey ? null : prKey;
    setExpandedPrKey(nextExpanded);
    if (nextExpanded === null) return;

    const existing = contexts[prKey];
    if (existing?.phase === "loaded" || existing?.phase === "loading") return;

    setContexts((prev) => ({ ...prev, [prKey]: { phase: "loading" } }));
    try {
      const data = await fetchProjectLinkPullRequestContext(actionProjectLinkId, pr.id);
      setContexts((prev) => ({ ...prev, [prKey]: { phase: "loaded", data } }));
    } catch (err) {
      setContexts((prev) => ({
        ...prev,
        [prKey]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [contexts, expandedPrKey, projectLinkForPullRequest]);

  useEffect(() => {
    if (projectLinks.length === 0) return;
    setProjectLinkId((current) => resolveActiveProjectLinkId(projectLinks, current));
  }, [projectLinks]);

  useEffect(() => {
    saveStoredActiveProjectLinkId(projectLinkId);
  }, [projectLinkId]);

  usePullRequestHandoff({
    projectLinkId,
    status,
    category,
    prs,
    filteredPrs,
    pageSize,
    contexts,
    setProjectLinkId,
    setStatus,
    setCategory,
    setExpandedPrKey,
    setHighlightedPrKey,
    setPage,
    setContexts,
  });

  const load = useCallback(async () => {
    await Promise.all([
      pullRequestsQuery.refetch(),
      insightArtifactsQuery.refetch(),
    ]);
  }, [insightArtifactsQuery, pullRequestsQuery]);

  useEffect(() => {
    setExpandedPrKey(null);
    setHighlightedPrKey(null);
    setContexts({});
    setQueueing({});
    setPreviews({});
  }, [projectLinkId, status]);

  useEffect(() => {
    if (!highlightedPrKey) return;
    const timer = window.setTimeout(() => {
      setHighlightedPrKey((current) => current === highlightedPrKey ? null : current);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedPrKey]);

  return {
    projectLinks,
    projectLinksLoading,
    projectLinkId,
    status,
    category,
    page,
    pageSize,
    prs,
    loading,
    refreshing,
    error,
    pullRequestWarnings,
    expandedPrKey,
    highlightedPrKey,
    contexts,
    queueing,
    previews,
    insightArtifacts,
    selectedProjectLink,
    branchScope,
    categoryCounts,
    filteredPrs,
    paginatedPrs,
    setProjectLinkId,
    setStatus,
    setCategory,
    setPage,
    setPageSize,
    load,
    toggleContext,
    handlePreviewInsight,
    handleQueueForReview,
    openSavedInsightInChat,
  };
}
