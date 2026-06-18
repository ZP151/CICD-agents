import type {
  ChatWorkflowActionResult,
  PipelineRunSummary,
  PullRequestSummary,
} from "../../api.js";

export type PipelineStatusFilter = "all" | "failed" | "running" | "succeeded" | "not_configured";

export interface PipelineFilterOption {
  key: PipelineStatusFilter;
  label: string;
}

export interface PipelineRow {
  projectLinkId: string;
  projectLinkName: string;
  repoPath: string;
  repository: string;
  project: string;
  orgUrl: string;
  pipelineId: string;
  pipelineName: string;
  defaultBranch: string;
  targetBranch: string;
  latestRun?: PipelineRunSummary;
  relatedPullRequests: PullRequestSummary[];
}

export type PipelineInspectState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: ChatWorkflowActionResult; runs: PipelineRunSummary[] }
  | { phase: "approval"; result: ChatWorkflowActionResult }
  | { phase: "error"; message: string };

export interface RunTone {
  label: string;
  tone: string;
}
