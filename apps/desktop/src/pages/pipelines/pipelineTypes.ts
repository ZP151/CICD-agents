import type {
  ChatWorkflowActionResult,
  PipelineConnection,
  PipelineRunSummary,
  PullRequestSummary,
} from "../../api.js";

export type PipelineStatusFilter = "all" | "failed" | "running" | "succeeded" | "saved" | "discovered";

export interface PipelineFilterOption {
  key: PipelineStatusFilter;
  label: string;
}

export interface PipelineRow {
  projectLinkId: string;
  projectLinkName: string;
  connectionId?: string;
  source: "saved" | "discovered";
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
  connection?: PipelineConnection;
}

export type PipelineInspectState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: ChatWorkflowActionResult; runs: PipelineRunSummary[] }
  | { phase: "analyzing"; result: ChatWorkflowActionResult; runs: PipelineRunSummary[]; analysis: string }
  | { phase: "analysis_done"; result: ChatWorkflowActionResult; runs: PipelineRunSummary[]; analysis: string }
  | { phase: "analysis_error"; result: ChatWorkflowActionResult; runs: PipelineRunSummary[]; analysis: string; message: string }
  | { phase: "approval"; result: ChatWorkflowActionResult }
  | { phase: "error"; message: string };

export interface RunTone {
  label: string;
  tone: string;
}
