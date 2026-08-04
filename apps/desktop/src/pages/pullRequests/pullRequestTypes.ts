import type {
  PullRequestContext,
  PullRequestSummary,
  PullRequestInsightPreview,
  ReviewRunResult,
} from "../../api.js";

export type DisplayPullRequest = PullRequestSummary & {
  sourceProjectLinkId?: string;
  sourceProjectLinkName?: string;
};

export function pullRequestRuntimeKey(pr: Pick<DisplayPullRequest, "id" | "repository" | "sourceProjectLinkId">): string {
  return `${pr.sourceProjectLinkId || "project-link"}:${pr.repository}:${pr.id}`;
}

export type PullRequestCategory = "all" | "mine" | "needs_review" | "waiting";

export type ContextState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "loaded"; data: PullRequestContext }
  | { phase: "error"; message: string };

export type QueueState =
  | { phase: "idle" }
  | { phase: "watching" }
  | { phase: "reviewing" }
  | { phase: "done"; result: ReviewRunResult }
  | { phase: "error"; message: string };

export type PreviewState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: PullRequestInsightPreview }
  | { phase: "error"; message: string };
