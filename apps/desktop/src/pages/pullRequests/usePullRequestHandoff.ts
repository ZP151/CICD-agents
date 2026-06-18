import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  PULL_REQUESTS_HANDOFF_KEY,
  handoffProjectLinkId,
  type PullRequestsHandoffDraft,
} from "../../checkpointHandoff.js";
import { fetchProjectLinkPullRequestContext } from "../../api.js";
import type { ContextState, DisplayPullRequest, PullRequestCategory } from "./pullRequestTypes.js";

function readPullRequestsHandoffDraft(): PullRequestsHandoffDraft | null {
  const raw = sessionStorage.getItem(PULL_REQUESTS_HANDOFF_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PullRequestsHandoffDraft;
  } catch {
    sessionStorage.removeItem(PULL_REQUESTS_HANDOFF_KEY);
    return null;
  }
}

export interface UsePullRequestHandoffInput {
  projectLinkId: string;
  status: string;
  category: PullRequestCategory;
  prs: DisplayPullRequest[];
  filteredPrs: DisplayPullRequest[];
  pageSize: number;
  contexts: Record<number, ContextState>;
  setProjectLinkId: Dispatch<SetStateAction<string>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setCategory: Dispatch<SetStateAction<PullRequestCategory>>;
  setExpandedPrId: Dispatch<SetStateAction<number | null>>;
  setHighlightedPrId: Dispatch<SetStateAction<number | null>>;
  setPage: Dispatch<SetStateAction<number>>;
  setContexts: Dispatch<SetStateAction<Record<number, ContextState>>>;
}

export function usePullRequestHandoff({
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
}: UsePullRequestHandoffInput): void {
  useEffect(() => {
    const draft = readPullRequestsHandoffDraft();
    if (!draft) return;
    const draftProjectLinkId = draft.kind === "pr" ? handoffProjectLinkId(draft) : "";
    if (draft.kind !== "pr" || !draftProjectLinkId || !draft.pullRequestId) {
      sessionStorage.removeItem(PULL_REQUESTS_HANDOFF_KEY);
      return;
    }
    if (projectLinkId !== draftProjectLinkId) setProjectLinkId(draftProjectLinkId);
    if (status !== "all") setStatus("all");
    if (category !== "all") setCategory("all");
  }, [category, projectLinkId, setCategory, setProjectLinkId, setStatus, status]);

  useEffect(() => {
    if (!projectLinkId) return;
    const draft = readPullRequestsHandoffDraft();
    if (!draft) return;
    const draftProjectLinkId = draft.kind === "pr" ? handoffProjectLinkId(draft) : "";
    if (draft.kind !== "pr" || draftProjectLinkId !== projectLinkId) return;
    const target = prs.find((pr) => (
      pr.id === draft.pullRequestId &&
      (!draft.repository || pr.repository === draft.repository)
    ));
    if (!target) return;

    setExpandedPrId(target.id);
    setHighlightedPrId(target.id);
    const targetIndex = filteredPrs.findIndex((pr) => (
      pr.id === target.id &&
      (!draft.repository || pr.repository === draft.repository)
    ));
    if (targetIndex >= 0) {
      setPage(Math.floor(targetIndex / pageSize) + 1);
    }
    const currentContext = contexts[target.id];
    if (!currentContext || currentContext.phase === "idle") {
      setContexts((prev) => ({ ...prev, [target.id]: { phase: "loading" } }));
      void fetchProjectLinkPullRequestContext(projectLinkId, target.id)
        .then((data) => setContexts((prev) => ({ ...prev, [target.id]: { phase: "loaded", data } })))
        .catch((err: unknown) => setContexts((prev) => ({
          ...prev,
          [target.id]: { phase: "error", message: err instanceof Error ? err.message : String(err) },
        })));
    }
    sessionStorage.removeItem(PULL_REQUESTS_HANDOFF_KEY);
  }, [
    contexts,
    filteredPrs,
    pageSize,
    projectLinkId,
    prs,
    setContexts,
    setExpandedPrId,
    setHighlightedPrId,
    setPage,
  ]);
}
