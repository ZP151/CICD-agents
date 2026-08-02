import type {
  ReviewFinding,
  ReviewQueueItem,
} from "../../api.js";
import { buildReviewAuditViewModel } from "../../reviewAudit.js";
import {
  categoryLabel,
  formatDate,
  severityTone,
} from "./reviewQueueViewModel.js";
import { StatusBadge, WorkbenchSidePanel } from "../../components/workbench/WorkbenchPrimitives.js";

export interface FindingsPanelProps {
  item: ReviewQueueItem;
  findings: ReviewFinding[];
  onClose: () => void;
}

export function FindingsPanel({ item, findings, onClose }: FindingsPanelProps): JSX.Element {
  const audit = buildReviewAuditViewModel(item);
  const summaryOnly = findings.length === 0;
  const detailsUnavailable = summaryOnly && item.findingCount > 0;
  return (
    <WorkbenchSidePanel
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={summaryOnly ? `Review summary (${item.findingCount})` : `Review Findings (${findings.length})`}
      description={`#${item.pullRequestId} · ${item.decisionReason}`}
    >
      {audit.hasAudit && <DispositionAuditSection audit={audit} />}
      {findings.length === 0 ? (
        <ReviewSummary item={item} detailsUnavailable={detailsUnavailable} />
      ) : (
        <ul className="space-y-3">
          {findings.map((finding, index) => (
            <li key={index} className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge className={severityTone(finding.severity)}>{finding.severity}</StatusBadge>
                <StatusBadge>{categoryLabel(finding.category)}</StatusBadge>
              </div>
              <p className="mt-2 truncate font-mono text-xs text-[rgb(var(--app-text-muted))]">
                {finding.file}
                {finding.line > 0 && <span className="text-[rgb(var(--app-text-subtle))]">:{finding.line}</span>}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-[rgb(var(--app-text))]">{finding.message}</p>
            </li>
          ))}
        </ul>
      )}
    </WorkbenchSidePanel>
  );
}

function ReviewSummary({
  item,
  detailsUnavailable,
}: {
  item: ReviewQueueItem;
  detailsUnavailable: boolean;
}): JSX.Element {
  const riskSeverity = item.decisionRiskLevel === "high"
    ? "blocking"
    : item.decisionRiskLevel === "medium"
      ? "warning"
      : "info";

  return (
    <section aria-label="Review summary" className="space-y-3">
      <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
        <p className="text-xs font-semibold text-[rgb(var(--app-text))]">Decision</p>
        <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text))]">
          {item.decisionReason || "No decision reason was recorded."}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatusBadge>{item.decisionQueue.replace(/_/g, " ")}</StatusBadge>
          <StatusBadge className={severityTone(riskSeverity)}>{item.decisionRiskLevel} risk</StatusBadge>
          <StatusBadge>{item.findingCount} finding{item.findingCount === 1 ? "" : "s"}</StatusBadge>
        </div>
      </div>
      <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
        <p className="text-xs font-semibold text-[rgb(var(--app-text))]">Coverage</p>
        <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          {item.hunkCoverageFiles > 0
            ? `${item.hunkCoverageFiles} changed file${item.hunkCoverageFiles === 1 ? "" : "s"} were reviewed from changed hunks${item.changedHunkLines > 0 ? ` (${item.changedHunkLines} lines).` : "."}`
            : "No changed-hunk coverage was recorded for this review."}
          {item.wholeFileFallbackFiles > 0
            ? ` ${item.wholeFileFallbackFiles} file${item.wholeFileFallbackFiles === 1 ? " used" : "s used"} whole-file fallback.`
            : ""}
        </p>
      </div>
      <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
        <p className="text-xs font-semibold text-[rgb(var(--app-text))]">
          {detailsUnavailable ? "Detailed findings are unavailable" : "No detailed findings were returned by this review run."}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          {detailsUnavailable
            ? `${item.findingCount} finding${item.findingCount === 1 ? " was" : "s were"} recorded in the review summary. Run a new review to restore file-level details.`
            : "The review completed without file-level findings. You can rerun it if the pull request has changed."}
        </p>
      </div>
    </section>
  );
}

type AuditViewModel = ReturnType<typeof buildReviewAuditViewModel>;

function DispositionAuditSection({ audit }: { audit: AuditViewModel }): JSX.Element {
  return (
    <section className="mb-4 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-[rgb(var(--app-text))]">Disposition audit</p>
          <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">{audit.dispositionSummary}</p>
        </div>
        {audit.dispositionAt && (
          <span className="text-xs text-[rgb(var(--app-text-subtle))]">{formatDate(audit.dispositionAt)}</span>
        )}
      </div>
      {audit.dispositionEvents.length > 0 && (
        <ol className="mt-3 space-y-2">
          {audit.dispositionEvents.map((event, index) => (
            <li key={`${event.at}-${event.label}-${index}`} className="rounded-md bg-[rgb(var(--app-surface))] p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-[rgb(var(--app-text))]">{event.label}</span>
                <span className="text-[11px] text-[rgb(var(--app-text-subtle))]">{event.at ? formatDate(event.at) : "Time not available"}</span>
              </div>
              <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
                {event.actor}
                {event.note ? ` · ${event.note}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
      {audit.writeBackSummary && <WriteBackSummary audit={audit} />}
      {audit.writeBackAttempts.length > 0 && <WriteBackAttempts audit={audit} />}
    </section>
  );
}

function WriteBackSummary({ audit }: { audit: AuditViewModel }): JSX.Element {
  const summary = audit.writeBackSummary;
  if (!summary) return <></>;
  return (
    <div className="mt-3 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2 text-xs">
      <p className={summary.ok ? "text-[rgb(var(--app-success))]" : "text-[rgb(var(--app-warning))]"}>
        ADO write-back {summary.statusLabel}
        {summary.at ? ` · ${formatDate(summary.at)}` : ""}
        {summary.threadId ? ` · thread ${summary.threadId}` : ""}
      </p>
      {summary.error && (
        <p className="mt-1 text-[rgb(var(--app-warning))]">{summary.error}</p>
      )}
      {summary.url && (
        <a
          href={summary.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-[rgb(var(--app-accent-readable))] underline-offset-2 hover:underline"
        >
          Open Azure DevOps thread
        </a>
      )}
    </div>
  );
}

function WriteBackAttempts({ audit }: { audit: AuditViewModel }): JSX.Element {
  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Write-back attempts</p>
      <ol className="mt-2 space-y-2">
        {audit.writeBackAttempts.map((event, index) => (
          <li key={`${event.at}-${event.dispositionLabel}-${index}`} className="rounded-md bg-[rgb(var(--app-surface))] p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={event.ok ? "text-[rgb(var(--app-success))]" : "text-[rgb(var(--app-warning))]"}>
                {event.statusLabel} · {event.dispositionLabel}
              </span>
              <span className="text-[11px] text-[rgb(var(--app-text-subtle))]">{event.at ? formatDate(event.at) : "Time not available"}</span>
            </div>
            <p className="mt-1 text-[rgb(var(--app-text-muted))]">
              {event.actor}
              {event.threadId ? ` · thread ${event.threadId}` : ""}
            </p>
            {event.note && <p className="mt-1 text-[rgb(var(--app-text-subtle))]">{event.note}</p>}
            {event.error && <p className="mt-1 text-[rgb(var(--app-warning))]">{event.error}</p>}
            {event.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex text-[rgb(var(--app-accent-readable))] underline-offset-2 hover:underline"
              >
                Open attempt thread
              </a>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
