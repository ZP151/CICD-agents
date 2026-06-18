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

export type PullRequestCategory = "all" | "attention" | "draft" | "reviewed";

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
