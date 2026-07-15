import { useState, type Dispatch, type SetStateAction } from "react";
import {
  recordProjectLinkReviewDisposition,
  recordProjectLinkReviewHistory,
  runProjectLinkReviewRun,
  type ProjectLink,
  type ReviewFinding,
  type ReviewQueueItem,
} from "../../api.js";
import { saveFindingsLocal } from "../../reviewHistoryLocal.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import {
  applyReviewRunToQueueItem,
  reviewQueueItemKey,
} from "../../reviewRunHistory.js";
import {
  buildManualDispositionUpdate,
  buildRetryDispositionWriteBackUpdate,
  requiresDispositionWriteBack,
} from "./reviewQueueRuntime.js";

type OperationInput = Omit<ReviewOperationEvent, "id" | "at" | "actor"> & {
  at?: string;
  actor?: string;
};

export interface ReviewQueueActionsArgs {
  projectLinkId: string;
  selectedProjectLink: ProjectLink | null;
  selectedItem: ReviewQueueItem | null;
  setError: (error: string | null) => void;
  load: () => Promise<void>;
  replaceItem: (source: ReviewQueueItem, next: ReviewQueueItem) => void;
  setPanelFindings: Dispatch<SetStateAction<ReviewFinding[]>>;
  recordOperation: (event: OperationInput) => void;
}

export function useReviewQueueActions({
  projectLinkId,
  selectedProjectLink,
  selectedItem,
  setError,
  load,
  replaceItem,
  setPanelFindings,
  recordOperation,
}: ReviewQueueActionsArgs) {
  const [writeBackRetrying, setWriteBackRetrying] = useState<Record<string, boolean>>({});
  const [rerunning, setRerunning] = useState<Record<string, boolean>>({});
  const [dispositionSaving, setDispositionSaving] = useState<Record<string, boolean>>({});

  async function applyDisposition(
    item: ReviewQueueItem,
    disposition: ReviewQueueItem["manualDisposition"],
  ): Promise<void> {
    if (!projectLinkId) return;
    const itemKey = reviewQueueItemKey(item);
    if (dispositionSaving[itemKey]) return;
    setDispositionSaving((prev) => ({ ...prev, [itemKey]: true }));
    const next = buildManualDispositionUpdate(item, disposition, {
      actor: "desktop-user",
      now: new Date().toISOString(),
    });
    replaceItem(item, next);
    try {
      const saved = await recordProjectLinkReviewDisposition(projectLinkId, next, {
        writeBackToAdo: requiresDispositionWriteBack(disposition),
      });
      recordOperation({
        kind: "disposition",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: next.manualDispositionNote,
        ok: true,
        details: next.manualDispositionNote,
      });
      if (saved) replaceItem(saved, saved);
    } catch (err) {
      recordOperation({
        kind: "disposition",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: next.manualDispositionNote,
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setDispositionSaving((prev) => ({ ...prev, [itemKey]: false }));
    }
  }

  async function retryDispositionWriteBack(item: ReviewQueueItem): Promise<void> {
    if (!projectLinkId || !item.manualDisposition) return;
    const retryKey = reviewQueueItemKey(item);
    if (writeBackRetrying[retryKey]) return;
    setWriteBackRetrying((prev) => ({ ...prev, [retryKey]: true }));
    const retrying = buildRetryDispositionWriteBackUpdate(item);
    replaceItem(item, retrying);
    try {
      const saved = await recordProjectLinkReviewDisposition(projectLinkId, retrying, {
        writeBackToAdo: true,
      });
      recordOperation({
        kind: "ado_retry",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: "Retry ADO write-back",
        ok: Boolean(saved?.manualDispositionWriteBackOk),
        details: saved?.manualDispositionWriteBackOk
          ? `Posted${saved.manualDispositionWriteBackThreadId ? ` to thread ${saved.manualDispositionWriteBackThreadId}` : ""}.`
          : saved?.manualDispositionWriteBackError || "ADO write-back still pending.",
      });
      if (saved) replaceItem(saved, saved);
    } catch (err) {
      recordOperation({
        kind: "ado_retry",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: "Retry ADO write-back",
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setWriteBackRetrying((prev) => ({ ...prev, [retryKey]: false }));
    }
  }

  async function rerunReview(item: ReviewQueueItem): Promise<void> {
    if (!projectLinkId) return;
    const rerunKey = reviewQueueItemKey(item);
    if (rerunning[rerunKey]) return;
    setRerunning((prev) => ({ ...prev, [rerunKey]: true }));
    setError(null);
    try {
      const result = await runProjectLinkReviewRun(
        projectLinkId,
        item.pullRequestId,
        selectedProjectLink?.targetBranch || "main",
      );
      const next = applyReviewRunToQueueItem(item, result);
      await recordProjectLinkReviewHistory(projectLinkId, next);
      saveFindingsLocal(result.repository, result.pullRequestId, result.findings ?? [], projectLinkId);
      recordOperation({
        kind: "rerun",
        repository: result.repository,
        pullRequestId: result.pullRequestId,
        label: "Rerun review",
        ok: true,
        details: `${result.decisionQueue.replace(/_/g, " ")} · ${result.findingCount} findings`,
      });
      replaceItem(item, next);
      setPanelFindings((current) =>
        selectedItem?.repository === item.repository &&
        selectedItem.pullRequestId === item.pullRequestId
          ? (result.findings ?? [])
          : current,
      );
    } catch (err) {
      recordOperation({
        kind: "rerun",
        repository: item.repository,
        pullRequestId: item.pullRequestId,
        label: "Rerun review",
        ok: false,
        details: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally {
      setRerunning((prev) => ({ ...prev, [rerunKey]: false }));
    }
  }

  return {
    writeBackRetrying,
    rerunning,
    dispositionSaving,
    applyDisposition,
    retryDispositionWriteBack,
    rerunReview,
  };
}
