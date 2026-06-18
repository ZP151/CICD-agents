import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type {
  ContextState,
  DisplayPullRequest,
  PreviewState,
  PullRequestCategory,
  QueueState,
} from "./pullRequestTypes.js";
import { usePullRequestActions } from "./usePullRequestActions.js";
import { usePullRequestHandoff } from "./usePullRequestHandoff.js";

export function usePullRequestsRuntime() {
  const { projectLinks, projectLinksLoading } = useAppData();
  const [projectLinkId, setProjectLinkId] = useState(() => loadStoredActiveProjectLinkId());
  const [status, setStatus] = useState("active");
  const [category, setCategory] = useState<PullRequestCategory>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [prs, setPrs] = useState<DisplayPullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPrId, setExpandedPrId] = useState<number | null>(null);
  const [highlightedPrId, setHighlightedPrId] = useState<number | null>(null);
  const [contexts, setContexts] = useState<Record<number, ContextState>>({});
  const [queueing, setQueueing] = useState<Record<number, QueueState>>({});
  const [previews, setPreviews] = useState<Record<number, PreviewState>>({});
  const [insightArtifacts, setInsightArtifacts] = useState<PrInsightArtifact[]>([]);
  const loadSeqRef = useRef(0);

  const selectedProjectLink = useMemo(
    () => projectLinks.find((projectLink) => projectLink.id === projectLinkId) ?? null,
    [projectLinks, projectLinkId],
  );
  const branchScope = projectLinkBranchScope(selectedProjectLink);
  const projectLinkForPullRequest = useCallback((pr: DisplayPullRequest) => {
    return pr.sourceProjectLinkId || projectLinkId;
  }, [projectLinkId]);

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
    setInsightArtifacts,
  });

  const toggleContext = useCallback(async (pr: DisplayPullRequest) => {
    const actionProjectLinkId = projectLinkForPullRequest(pr);
    if (!actionProjectLinkId) return;
    const nextExpanded = expandedPrId === pr.id ? null : pr.id;
    setExpandedPrId(nextExpanded);
    if (nextExpanded === null) return;

    const existing = contexts[pr.id];
    if (existing?.phase === "loaded" || existing?.phase === "loading") return;

    setContexts((prev) => ({ ...prev, [pr.id]: { phase: "loading" } }));
    try {
      const data = await fetchProjectLinkPullRequestContext(actionProjectLinkId, pr.id);
      setContexts((prev) => ({ ...prev, [pr.id]: { phase: "loaded", data } }));
    } catch (err) {
      setContexts((prev) => ({
        ...prev,
        [pr.id]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }, [contexts, expandedPrId, projectLinkForPullRequest]);

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
    setExpandedPrId,
    setHighlightedPrId,
    setPage,
    setContexts,
  });

  useEffect(() => {
    if (!projectLinkId) {
      setInsightArtifacts(listPrInsightArtifacts());
      return;
    }
    const local = listPrInsightArtifacts(projectLinkId);
    setInsightArtifacts(local);
    let cancelled = false;
    void fetchProjectLinkPrInsightArtifacts(projectLinkId)
      .then((remote) => {
        if (cancelled) return;
        setInsightArtifacts(mergeInsightArtifacts([...(remote as PrInsightArtifact[]), ...local]));
      })
      .catch(() => {
        /* browser-local artifacts are enough when daemon is unavailable */
      });
    return () => {
      cancelled = true;
    };
  }, [projectLinkId]);

  const load = useCallback(async () => {
    if (!projectLinkId && projectLinks.length === 0) return;
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setLoading(true);
    setError(null);
    try {
      const nextPrs = projectLinkId
        ? (await fetchProjectLinkPullRequests(projectLinkId, status))
          .filter((pr) => matchesProjectLinkBranch(pr, selectedProjectLink))
          .map((pr) => ({
            ...pr,
            sourceProjectLinkId: projectLinkId,
            sourceProjectLinkName: selectedProjectLink?.name,
          }))
        : dedupePullRequests((await Promise.all(projectLinks.map(async (projectLink) => {
          const items = await fetchProjectLinkPullRequests(projectLink.id, status);
          return items.map((pr) => ({
            ...pr,
            sourceProjectLinkId: projectLink.id,
            sourceProjectLinkName: projectLink.name,
          }));
        }))).flat());
      if (loadSeqRef.current !== seq) return;
      setPrs(nextPrs);
    } catch (err) {
      if (loadSeqRef.current !== seq) return;
      setPrs([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (loadSeqRef.current === seq) setLoading(false);
    }
  }, [projectLinkId, projectLinks, selectedProjectLink, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPrs([]);
    setError(null);
    setExpandedPrId(null);
    setHighlightedPrId(null);
    setContexts({});
    setQueueing({});
    setPreviews({});
  }, [projectLinkId, status]);

  useEffect(() => {
    if (!highlightedPrId) return;
    const timer = window.setTimeout(() => {
      setHighlightedPrId((current) => current === highlightedPrId ? null : current);
    }, 5000);
    return () => window.clearTimeout(timer);
  }, [highlightedPrId]);

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
    error,
    expandedPrId,
    highlightedPrId,
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
