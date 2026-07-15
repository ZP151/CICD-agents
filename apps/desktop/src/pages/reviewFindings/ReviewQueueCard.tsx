import type { ReviewQueueItem } from "../../api.js";
import { buildReviewAuditCardSummary, dispositionLabel } from "../../reviewAudit.js";
import { loadFindingsLocal, reviewQueuePriorityReasons } from "../../reviewHistoryLocal.js";
import {
  reviewQueueFreshnessStatus,
  reviewQueueItemKey,
} from "../../reviewRunHistory.js";
import {
  formatDate,
  riskTone,
  shortCommit,
} from "./reviewQueueViewModel.js";

export interface ReviewQueueCardProps {
  item: ReviewQueueItem;
  projectLinkId: string;
  staleAgeHours: number;
  writeBackRetrying: Record<string, boolean>;
  rerunning: Record<string, boolean>;
  dispositionSaving: Record<string, boolean>;
  onOpenFindings: (item: ReviewQueueItem) => void;
  onRerunReview: (item: ReviewQueueItem) => void;
  onRetryDispositionWriteBack: (item: ReviewQueueItem) => void;
  onApplyDisposition: (item: ReviewQueueItem, disposition: ReviewQueueItem["manualDisposition"]) => void;
}

export function ReviewQueueCard({
  item,
  projectLinkId,
  staleAgeHours,
  writeBackRetrying,
  rerunning,
  dispositionSaving,
  onOpenFindings,
  onRerunReview,
  onRetryDispositionWriteBack,
  onApplyDisposition,
}: ReviewQueueCardProps): JSX.Element {
  const storedFindings = loadFindingsLocal(item.repository, item.pullRequestId, projectLinkId);
  const hasFindings = item.findingCount > 0 || storedFindings.length > 0;
  const attentionReasons = reviewQueuePriorityReasons(item);
  const itemKey = reviewQueueItemKey(item);
  const isRetryingWriteBack = Boolean(writeBackRetrying[itemKey]);
  const isRerunning = Boolean(rerunning[itemKey]);
  const isDispositionSaving = Boolean(dispositionSaving[itemKey]);
  const freshness = reviewQueueFreshnessStatus(item, Date.now(), staleAgeHours);
  const auditSummary = buildReviewAuditCardSummary(item);

  return (
    <article className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-blue-400">#{item.pullRequestId}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${riskTone(item.decisionRiskLevel)}`}>
              {item.decisionRiskLevel}
            </span>
            <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
              {item.decisionQueue.replace(/_/g, " ")}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${
              freshness.stale
                ? "bg-yellow-950/30 text-yellow-400 ring-yellow-900/60"
                : "bg-emerald-950/20 text-emerald-500/80 ring-emerald-900/40"
            }`}>
              {freshness.label}
            </span>
          </div>
          <p className="truncate text-sm font-medium text-zinc-200">{item.decisionReason || "No decision reason recorded."}</p>
          <p className="mt-1 truncate font-mono text-xs text-zinc-600">
            iteration {item.lastIterationId} · {shortCommit(item.sourceCommit)}
          </p>
          {attentionReasons.length > 0 && (
            <p className="mt-2 text-xs text-zinc-500">
              Attention: {attentionReasons.slice(0, 4).join(" · ")}
            </p>
          )}
          {(item.autoApprovedAt || item.autoApprovalActor) && (
            <p className="mt-1 text-xs text-zinc-600">
              Auto-approval: {item.autoApprovedAt ? formatDate(item.autoApprovedAt) : "not recorded"}
              {item.autoApprovalActor ? ` · ${item.autoApprovalActor}` : ""}
            </p>
          )}
          {auditSummary.hasAudit && (
            <p className={`mt-1 text-xs ${
              auditSummary.tone === "success"
                ? "text-emerald-500/75"
                : auditSummary.tone === "warning"
                  ? "text-yellow-500/80"
                  : "text-zinc-600"
            }`}>
              Audit: {auditSummary.label}
              {item.manualDispositionAt ? ` · ${formatDate(item.manualDispositionAt)}` : ""}
              {auditSummary.threadId ? ` · thread ${auditSummary.threadId}` : ""}
              {auditSummary.url && (
                <>
                  {" · "}
                  <a
                    href={auditSummary.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400/80 underline-offset-2 hover:text-blue-300 hover:underline"
                  >
                    open thread
                  </a>
                </>
              )}
            </p>
          )}
        </div>
        <p className="text-xs text-zinc-600">{formatDate(item.lastRunAt)}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-4">
          <div>
            <p className="text-zinc-700">Findings</p>
            <p className="mt-1 text-zinc-400">{item.findingCount}</p>
          </div>
          <div>
            <p className="text-zinc-700">Discarded</p>
            <p className="mt-1 text-zinc-400">{item.discardedFindingCount}</p>
          </div>
          <div>
            <p className="text-zinc-700">Hunk coverage</p>
            <p className="mt-1 text-zinc-400">
              {item.hunkCoverageFiles} files · {item.changedHunkLines} lines
            </p>
          </div>
          <div>
            <p className="text-zinc-700">Fallback</p>
            <p className="mt-1 text-zinc-400">{item.wholeFileFallbackFiles} files</p>
          </div>
        </div>
        {hasFindings && (
          <button
            onClick={() => onOpenFindings(item)}
            className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-blue-700 hover:text-blue-300"
          >
            View findings
            {storedFindings.length > 0 && (
              <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                {storedFindings.length}
              </span>
            )}
          </button>
        )}
        <ReviewQueueCardActions
          item={item}
          isRerunning={isRerunning}
          isRetryingWriteBack={isRetryingWriteBack}
          isDispositionSaving={isDispositionSaving}
          onRerunReview={onRerunReview}
          onRetryDispositionWriteBack={onRetryDispositionWriteBack}
          onApplyDisposition={onApplyDisposition}
        />
      </div>
    </article>
  );
}

function ReviewQueueCardActions({
  item,
  isRerunning,
  isRetryingWriteBack,
  isDispositionSaving,
  onRerunReview,
  onRetryDispositionWriteBack,
  onApplyDisposition,
}: {
  item: ReviewQueueItem;
  isRerunning: boolean;
  isRetryingWriteBack: boolean;
  isDispositionSaving: boolean;
  onRerunReview: (item: ReviewQueueItem) => void;
  onRetryDispositionWriteBack: (item: ReviewQueueItem) => void;
  onApplyDisposition: (item: ReviewQueueItem, disposition: ReviewQueueItem["manualDisposition"]) => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      <button
        type="button"
        disabled={isRerunning}
        onClick={() => onRerunReview(item)}
        className="rounded-md border border-blue-900/50 px-2.5 py-1 text-xs text-blue-400/80 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRerunning ? "Rerunning..." : "Rerun review"}
      </button>
      {item.manualDisposition &&
        (item.manualDisposition === "marked_blocked" || item.manualDisposition === "changes_requested") &&
        !item.manualDispositionWriteBackOk && (
          <button
            type="button"
            disabled={isRetryingWriteBack}
            onClick={() => onRetryDispositionWriteBack(item)}
            className="rounded-md border border-blue-900/50 px-2.5 py-1 text-xs text-blue-400/80 transition hover:border-blue-700 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRetryingWriteBack ? "Retrying..." : "Retry ADO"}
          </button>
        )}
      <button
        type="button"
        disabled={isDispositionSaving}
        onClick={() => onApplyDisposition(item, "acknowledged")}
        className="rounded-md border border-zinc-800 px-2.5 py-1 text-xs text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isDispositionSaving ? "Saving..." : "Acknowledge"}
      </button>
      <button
        type="button"
        disabled={isDispositionSaving}
        onClick={() => onApplyDisposition(item, "marked_safe")}
        className="rounded-md border border-emerald-900/50 px-2.5 py-1 text-xs text-emerald-400/80 transition hover:border-emerald-700 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Mark safe
      </button>
      <button
        type="button"
        disabled={isDispositionSaving}
        onClick={() => onApplyDisposition(item, "marked_blocked")}
        className="rounded-md border border-red-900/50 px-2.5 py-1 text-xs text-red-400/80 transition hover:border-red-700 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Block
      </button>
      <button
        type="button"
        disabled={isDispositionSaving}
        onClick={() => onApplyDisposition(item, "changes_requested")}
        className="rounded-md border border-yellow-900/50 px-2.5 py-1 text-xs text-yellow-400/80 transition hover:border-yellow-700 hover:text-yellow-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Request changes
      </button>
    </div>
  );
}
