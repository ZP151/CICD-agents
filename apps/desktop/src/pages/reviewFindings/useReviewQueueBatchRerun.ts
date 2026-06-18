import { useState } from "react";
import type { ReviewQueueItem } from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import { reviewQueueItemKey } from "../../reviewRunHistory.js";

export interface ReviewQueueBatchRerunArgs {
  projectLinkId: string;
  repositoryName: string;
  rerunning: Record<string, boolean>;
  rerunReview: (item: ReviewQueueItem) => Promise<void>;
  recordOperation: (event: {
    kind: ReviewOperationEvent["kind"];
    repository: string;
    pullRequestId: number;
    label: string;
    ok: boolean;
    details: string;
  }) => void;
}

export function useReviewQueueBatchRerun({
  projectLinkId,
  recordOperation,
  repositoryName,
  rerunning,
  rerunReview,
}: ReviewQueueBatchRerunArgs) {
  const [batchRerunning, setBatchRerunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);
  const [batchMode, setBatchMode] = useState<"visible" | "stale">("visible");

  async function rerunReviewItems(
    candidates: ReviewQueueItem[],
    mode: "visible" | "stale",
  ): Promise<void> {
    if (!projectLinkId || candidates.length === 0 || batchRerunning) return;
    const queue = candidates.filter((item) => !rerunning[reviewQueueItemKey(item)]);
    if (queue.length === 0) return;
    recordOperation({
      kind: mode === "stale" ? "stale_rerun" : "batch_rerun",
      repository: repositoryName,
      pullRequestId: 0,
      label: mode === "stale" ? "Rerun stale" : "Rerun visible",
      ok: true,
      details: `${queue.length} queued`,
    });
    setBatchMode(mode);
    setBatchRerunning(true);
    setBatchProgress({ done: 0, total: queue.length });
    try {
      let done = 0;
      for (const item of queue) {
        await rerunReview(item);
        done += 1;
        setBatchProgress({ done, total: queue.length });
      }
    } finally {
      setBatchRerunning(false);
    }
  }

  return {
    batchRerunning,
    batchProgress,
    batchMode,
    rerunReviewItems,
  };
}
