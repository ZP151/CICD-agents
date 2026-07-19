import type { ReviewActivityItem } from "./activityTypes.js";
import {
  formatIsoTime,
  reviewOperationKindLabel,
  reviewOperationStatusClass,
} from "./activityPresentation.js";
import { operationDetailSummary } from "./operationDetailSummary.js";

function shouldFoldOperationDetails(details: string): boolean {
  const trimmed = details.trim();
  if (trimmed.length > 220) return true;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  return /"?(returncode|stdout|stderr|fieldErrors|formErrors|error)"?\s*:/.test(trimmed);
}

export function ReviewOperationDetailPanel({
  operation,
}: {
  operation: ReviewActivityItem;
}): JSX.Element {
  const detailsShouldFold = operation.details ? shouldFoldOperationDetails(operation.details) : false;
  const detailsSummary = operation.details && detailsShouldFold
    ? operationDetailSummary(operation.details)
    : null;

  return (
    <div className="space-y-5">
      <header className="border-b border-[rgb(var(--app-border))] pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${reviewOperationStatusClass(operation.ok)}`}
          >
            {operation.ok ? "recorded" : "attention"}
          </span>
          <span className="text-xs text-[rgb(var(--app-text-muted))]">
            {reviewOperationKindLabel(operation.kind)}
          </span>
          <span className="text-xs text-[rgb(var(--app-text-muted))]">
            {formatIsoTime(operation.at)}
          </span>
        </div>
        <h2 className="text-lg font-semibold text-[rgb(var(--app-text))]">{operation.label}</h2>
        <p className="mt-1 font-mono text-xs text-[rgb(var(--app-text-muted))]">{operation.id}</p>
      </header>

      <section className={reviewOperationFactGridClass()}>
        <ReviewOperationFact label="Project Link" value={operation.projectLinkName} />
        <ReviewOperationFact label="Repository" value={operation.repository} mono />
        <ReviewOperationFact
          label="Pull Request"
          value={
            operation.pullRequestId > 0 ? `#${operation.pullRequestId}` : "Queue-level operation"
          }
          mono
        />
        <ReviewOperationFact label="Actor" value={operation.actor || "Not available"} />
      </section>

      <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Details
        </h3>
        {!operation.details && (
          <p className="break-words text-sm text-[rgb(var(--app-text))]">
            No details recorded.
          </p>
        )}
        {operation.details && detailsShouldFold && (
          <>
            <p className="break-words text-sm text-[rgb(var(--app-text))]">
              {detailsSummary ?? "Structured operation details are available."}
            </p>
            <details className="mt-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2">
              <summary className="cursor-pointer text-xs font-medium text-[rgb(var(--app-text-muted))]">
                Raw detail
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
                {operation.details}
              </pre>
            </details>
          </>
        )}
        {operation.details && !detailsShouldFold && (
          <p className="break-words text-sm text-[rgb(var(--app-text))]">
            {operation.details}
          </p>
        )}
      </section>
    </div>
  );
}

export function reviewOperationFactGridClass(): string {
  return "grid gap-3 text-sm grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]";
}

function ReviewOperationFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
      <p className="text-xs text-[rgb(var(--app-text-muted))]">{label}</p>
      <p className={`mt-1 text-[rgb(var(--app-text))] ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
