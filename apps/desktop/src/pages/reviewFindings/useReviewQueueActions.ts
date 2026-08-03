import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  fetchAuthStatus,
  recordProjectLinkReviewDisposition,
  recordProjectLinkReviewHistory,
  runProjectLinkReviewRun,
  type ProjectLink,
  type ReviewFinding,
  type ReviewQueueItem,
} from "../../api.js";
import { loadFindingsLocal, saveFindingsLocal } from "../../reviewHistoryLocal.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import {
  applyReviewRunToQueueItem,
  resolveReviewRunFindings,
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
  // MP-009/RA-041: dispositions that write back to ADO require an explicit
  // approval showing the target and content first. The disposition itself is
  // always recorded; only the remote mutation waits for confirmation.
  const [pendingWriteBack, setPendingWriteBack] = useState<{
    item: ReviewQueueItem;
    disposition: ReviewQueueItem["manualDisposition"];
  } | null>(null);
  const actorRef = useRef<string | null>(null);

  const currentActor = useCallback(async (): Promise<string> => {
    if (actorRef.current) return actorRef.current;
    try {
      const user = await fetchAuthStatus();
      const actor = user.name?.trim() || user.upn?.trim() || "desktop-user";
      actorRef.current = actor;
      return actor;
    } catch {
      return "desktop-user";
    }
  }, []);

  async function submitDisposition(
    item: ReviewQueueItem,
    disposition: ReviewQueueItem["manualDisposition"],
    writeBackToAdo: boolean,
  ): Promise<void> {
    const itemKey = reviewQueueItemKey(item);
    const next = buildManualDispositionUpdate(item, disposition, {
      actor: await currentActor(),
      now: new Date().toISOString(),
    });
    replaceItem(item, next);
    try {
      const saved = await recordProjectLinkReviewDisposition(projectLinkId, next, {
        writeBackToAdo,
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

  /** RA-041: disposition recorded + writeback only after explicit approval. */
  async function applyDisposition(
    item: ReviewQueueItem,
    disposition: ReviewQueueItem["manualDisposition"],
  ): Promise<void> {
    if (!projectLinkId) return;
    const itemKey = reviewQueueItemKey(item);
    if (dispositionSaving[itemKey]) return;
    if (requiresDispositionWriteBack(disposition)) {
      setPendingWriteBack({ item, disposition });
      return;
    }
    setDispositionSaving((prev) => ({ ...prev, [itemKey]: true }));
    await submitDisposition(item, disposition, false);
  }

  async function confirmDispositionWriteBack(): Promise<void> {
    if (!pendingWriteBack) return;
    const { item, disposition } = pendingWriteBack;
    setPendingWriteBack(null);
    const itemKey = reviewQueueItemKey(item);
    setDispositionSaving((prev) => ({ ...prev, [itemKey]: true }));
    await submitDisposition(item, disposition, true);
  }

  async function keepDispositionLocal(): Promise<void> {
    if (!pendingWriteBack) return;
    const { item, disposition } = pendingWriteBack;
    setPendingWriteBack(null);
    const itemKey = reviewQueueItemKey(item);
    setDispositionSaving((prev) => ({ ...prev, [itemKey]: true }));
    await submitDisposition(item, disposition, false);
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
      const findings = resolveReviewRunFindings(
        result,
        loadFindingsLocal(result.repository, result.pullRequestId, projectLinkId),
      );
      await recordProjectLinkReviewHistory(projectLinkId, next);
      if (findings.shouldPersist) {
        saveFindingsLocal(result.repository, result.pullRequestId, findings.findings, projectLinkId);
      }
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
          ? findings.findings
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
    pendingWriteBack,
    applyDisposition,
    confirmDispositionWriteBack,
    keepDispositionLocal,
    retryDispositionWriteBack,
    rerunReview,
  };
}
