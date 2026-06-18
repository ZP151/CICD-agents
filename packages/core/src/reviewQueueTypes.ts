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

export interface ReviewQueuePriority {
  score: number;
  reasons: string[];
}
