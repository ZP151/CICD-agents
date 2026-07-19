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

export interface FindingsPanelProps {
  item: ReviewQueueItem;
  findings: ReviewFinding[];
  onClose: () => void;
}

export function FindingsPanel({ item, findings, onClose }: FindingsPanelProps): JSX.Element {
  const audit = buildReviewAuditViewModel(item);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--app-border))] p-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-[rgb(var(--app-accent-readable))]">#{item.pullRequestId}</p>
            <h3 className="mt-1 truncate text-sm font-semibold text-[rgb(var(--app-text))]">
              Review Findings ({findings.length})
            </h3>
            <p className="mt-0.5 truncate text-xs text-[rgb(var(--app-text-muted))]">{item.decisionReason}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {audit.hasAudit && <DispositionAuditSection audit={audit} />}
          {findings.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-sm font-medium text-[rgb(var(--app-text))]">No findings stored</p>
                <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
                  Run a new review from the Pull Requests page to capture findings.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-3">
              {findings.map((finding, index) => (
                <li
                  key={index}
                  className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${severityTone(finding.severity)}`}>
                      {finding.severity}
                    </span>
                    <span className="rounded-full bg-[rgb(var(--app-surface))] px-1.5 py-0.5 text-[10px] text-[rgb(var(--app-text-muted))]">
                      {categoryLabel(finding.category)}
                    </span>
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
        </div>
      </aside>
    </div>
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
