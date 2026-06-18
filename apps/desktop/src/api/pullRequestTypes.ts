export interface PipelineRunSummary {
  id: number;
  name: string;
  state: string;
  result: string;
  createdDate: string;
  finishedDate: string;
  sourceBranch: string;
  url: string;
}

export interface PullRequestSummary {
  id: number;
  title: string;
  status: string;
  isDraft: boolean;
  sourceBranch: string;
  targetBranch: string;
  createdBy: string;
  creationDate: string;
  repository: string;
  url: string;
  reviewerCount: number;
  voteSummary: {
    approved: number;
    waiting: number;
    rejected: number;
  };
  pipelineRun?: PipelineRunSummary;
}

export interface PullRequestThreadSummary {
  id: number;
  publishedDate: string;
  lastUpdatedDate: string;
  status: string | number;
  comments: Array<{
    id: number;
    author: {
      displayName: string;
      uniqueName: string;
    };
    content: string;
    publishedDate: string;
    lastUpdatedDate: string;
    lastContentUpdatedDate: string;
  }>;
  threadContext: unknown;
}

export interface BuildSummary {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  queueTime: string;
  startTime: string;
  finishTime: string;
  sourceBranch: string;
  sourceVersion: string;
  definitionName: string;
  repository: string;
  requestedFor: string;
  url: string;
}

export interface PullRequestChangesSummary {
  iterationId: number;
  sourceCommit: string;
  targetCommit: string;
  commonCommit: string;
  fileCount: number;
  changes: Array<{
    changeId: number;
    changeType: string | number;
    path: string;
    originalPath: string;
    gitObjectType: string;
    commitId: string;
  }>;
  nextSkip?: number;
  nextTop?: number;
}

export interface PullRequestContext {
  source: "internal";
  pullRequest: PullRequestSummary & {
    codeReviewId: number;
    project: string;
    description: string;
    closedDate: string;
    workItemRefs: Array<{ id: string; url: string }>;
  };
  threads: PullRequestThreadSummary[];
  changes: PullRequestChangesSummary;
  builds: BuildSummary[];
}

export interface PullRequestInsightPreview {
  source: "llm" | "heuristic";
  summary: string;
  readiness?: "ready" | "needs_attention" | "blocked";
  risks: string[];
  categories?: {
    blocking: string[];
    warnings: string[];
    info: string[];
  };
  signals: {
    fileCount: number;
    threadCount: number;
    failedBuildCount: number;
    workItemCount: number;
    failedPolicyCount?: number;
    buildBlockers?: Array<{
      id: number;
      buildNumber: string;
      definitionName: string;
      status: string;
      result: string;
      url: string;
    }>;
    policyBlockers?: Array<{
      id: string;
      name: string;
      typeName: string;
      status: string;
      isBlocking: boolean;
    }>;
    activeThreads?: Array<{
      id: number;
      status: string | number;
      author: string;
      firstComment: string;
    }>;
    linkedWorkItems?: Array<{
      id: number;
      type: string;
      title: string;
      state: string;
      url: string;
    }>;
  };
  tokensIn: number;
  tokensOut: number;
}

export interface PrInsightArtifactRecord {
  id: string;
  projectLinkId: string;
  repository: string;
  pullRequestId: number;
  title: string;
  kind: "insight_preview" | "review_run";
  at: string;
  summary: string;
  readiness?: "ready" | "needs_attention" | "blocked";
  decisionQueue?: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel?: "low" | "medium" | "high";
  contextConfidence?: "high" | "medium" | "low" | "";
  risks: string[];
  categories?: {
    blocking: string[];
    warnings: string[];
    info: string[];
  };
  signals?: PullRequestInsightPreview["signals"];
  iterationId?: number;
  sourceCommit?: string;
  findingCount?: number;
  discardedFindingCount?: number;
  tokensIn: number;
  tokensOut: number;
}

export interface PrInsightArtifactHistoryMeta {
  artifactId: string;
  index: number;
  total: number;
  latest: boolean;
}

export interface ReviewQueueItem {
  repository: string;
  pullRequestId: number;
  lastIterationId: number;
  findingCount: number;
  lastRunAt: string;
  sourceCommit: string;
  decisionQueue: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel: "low" | "medium" | "high";
  decisionReason: string;
  decisionReasonCodes: string[];
  contextConfidence: "high" | "medium" | "low" | "";
  autoApprovedAt: string;
  autoApprovalActor: string;
  discardedFindingCount: number;
  hunkCoverageFiles: number;
  wholeFileFallbackFiles: number;
  changedHunkLines: number;
  manualDisposition: "" | "acknowledged" | "marked_safe" | "marked_blocked" | "changes_requested";
  manualDispositionAt: string;
  manualDispositionActor: string;
  manualDispositionNote: string;
  manualDispositionEvents: ReviewDispositionEvent[];
  manualDispositionWriteBackAttempted: boolean;
  manualDispositionWriteBackOk: boolean;
  manualDispositionWriteBackError: string;
  manualDispositionWriteBackAt: string;
  manualDispositionWriteBackThreadId: string;
  manualDispositionWriteBackUrl: string;
  manualDispositionWriteBackEvents: ReviewWriteBackEvent[];
}

export interface ReviewDispositionEvent {
  disposition: ReviewQueueItem["manualDisposition"];
  at: string;
  actor: string;
  note: string;
}

export interface ReviewWriteBackEvent {
  disposition: ReviewQueueItem["manualDisposition"];
  at: string;
  ok: boolean;
  actor: string;
  note: string;
  error: string;
  threadId: string;
  url: string;
}

export interface ReviewFinding {
  file: string;
  line: number;
  severity: "info" | "warning" | "blocking";
  category: "bug" | "missing-test" | "security" | "style" | "design";
  message: string;
}

export interface ReviewDiscardedFinding extends ReviewFinding {
  reason: "unknown_file" | "invalid_line" | "outside_changed_hunk" | "empty_message" | "duplicate";
}

export interface ReviewRunResult {
  ok: boolean;
  pullRequestId: number;
  repository: string;
  iterationId: number;
  sourceCommit?: string;
  findingCount: number;
  decisionQueue: "auto_approved" | "needs_human_review" | "blocked" | "watching";
  decisionRiskLevel: "low" | "medium" | "high";
  decisionReason: string;
  decisionReasonCodes?: string[];
  contextConfidence?: "high" | "medium" | "low";
  readiness?: "ready" | "needs_attention" | "blocked";
  categories?: {
    blocking: string[];
    warnings: string[];
    info: string[];
  };
  lastRunAt: string;
  autoApprovalActor: string;
  tokensIn: number;
  tokensOut: number;
  summary: string;
  metadata?: {
    estimatedEffort: 1 | 2 | 3 | 4 | 5;
    testsRequired: boolean;
    securityConcern: boolean;
    canBeSplit: boolean;
    keyIssues: string[];
  };
  compression?: {
    compressed: boolean;
    includedFiles: string[];
    omittedFiles: string[];
  };
  coverage?: {
    totalFiles: number;
    filesWithHunks: number;
    wholeFileOnlyFiles: number;
    hunkCount: number;
    changedHunkLines: number;
  };
  findings?: ReviewFinding[];
  discardedFindings?: ReviewDiscardedFinding[];
}
