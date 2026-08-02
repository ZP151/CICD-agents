import type { ReviewFinding, ReviewQueueItem, ReviewRunResult } from "./api.js";

export const DEFAULT_STALE_REVIEW_AGE_HOURS = 24;

export interface ReviewRunFindingsResolution {
  findings: ReviewFinding[];
  /**
   * A result with an explicit findings payload is authoritative, including an
   * empty list. Summary-only responses are not: persisting an empty list for
   * those used to erase the last inspectable evidence from Review Queue.
   */
  shouldPersist: boolean;
  source: "result" | "clean_result" | "stored";
}

export function resolveReviewRunFindings(
  result: Pick<ReviewRunResult, "findingCount" | "findings">,
  storedFindings: ReviewFinding[] = [],
): ReviewRunFindingsResolution {
  if (result.findings !== undefined) {
    return { findings: result.findings, shouldPersist: true, source: "result" };
  }
  if (result.findingCount === 0) {
    return { findings: [], shouldPersist: true, source: "clean_result" };
  }
  return { findings: storedFindings, shouldPersist: false, source: "stored" };
}

export function reviewQueueItemKey(item: Pick<ReviewQueueItem, "repository" | "pullRequestId">): string {
  return `${item.repository}/${item.pullRequestId}`;
}

export interface ReviewQueueFreshnessStatus {
  stale: boolean;
  label: string;
  reason: "fresh" | "missing_confidence" | "invalid_last_run" | "age";
  ageHours: number | null;
}

export function reviewQueueFreshnessStatus(
  item: ReviewQueueItem,
  nowMs = Date.now(),
  staleAgeHours = DEFAULT_STALE_REVIEW_AGE_HOURS,
): ReviewQueueFreshnessStatus {
  if (!item.contextConfidence) {
    return {
      stale: true,
      label: "stale: missing confidence",
      reason: "missing_confidence",
      ageHours: null,
    };
  }
  const lastRunMs = Date.parse(item.lastRunAt);
  if (!Number.isFinite(lastRunMs)) {
    return {
      stale: true,
      label: "stale: unknown age",
      reason: "invalid_last_run",
      ageHours: null,
    };
  }
  const ageHours = Math.max(0, Math.floor((nowMs - lastRunMs) / (60 * 60 * 1000)));
  if (nowMs - lastRunMs >= staleAgeHours * 60 * 60 * 1000) {
    return {
      stale: true,
      label: `stale: ${ageHours}h old`,
      reason: "age",
      ageHours,
    };
  }
  return {
    stale: false,
    label: `fresh: ${ageHours}h old`,
    reason: "fresh",
    ageHours,
  };
}

export function isReviewQueueItemStale(
  item: ReviewQueueItem,
  nowMs = Date.now(),
  staleAgeHours = DEFAULT_STALE_REVIEW_AGE_HOURS,
): boolean {
  return reviewQueueFreshnessStatus(item, nowMs, staleAgeHours).stale;
}

export function staleReviewQueueItems(
  items: ReviewQueueItem[],
  nowMs = Date.now(),
  staleAgeHours = DEFAULT_STALE_REVIEW_AGE_HOURS,
): ReviewQueueItem[] {
  return items.filter((item) => isReviewQueueItemStale(item, nowMs, staleAgeHours));
}

export function applyReviewRunToQueueItem(
  previous: ReviewQueueItem,
  result: ReviewRunResult,
): ReviewQueueItem {
  return {
    ...previous,
    repository: result.repository,
    pullRequestId: result.pullRequestId,
    lastIterationId: result.iterationId,
    findingCount: result.findingCount,
    lastRunAt: result.lastRunAt,
    sourceCommit: result.sourceCommit ?? previous.sourceCommit ?? "",
    decisionQueue: result.decisionQueue,
    decisionRiskLevel: result.decisionRiskLevel,
    decisionReason: result.decisionReason,
    decisionReasonCodes: result.decisionReasonCodes ?? [],
    contextConfidence: result.contextConfidence ?? "",
    autoApprovedAt: result.decisionQueue === "auto_approved" ? result.lastRunAt : "",
    autoApprovalActor: result.decisionQueue === "auto_approved" ? result.autoApprovalActor : "",
    discardedFindingCount: result.discardedFindings?.length ?? 0,
    hunkCoverageFiles: result.coverage?.filesWithHunks ?? 0,
    wholeFileFallbackFiles: result.coverage?.wholeFileOnlyFiles ?? 0,
    changedHunkLines: result.coverage?.changedHunkLines ?? 0,
  };
}
