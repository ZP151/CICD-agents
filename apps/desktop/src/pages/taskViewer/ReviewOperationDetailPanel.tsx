import type { ReviewActivityItem } from "./activityTypes.js";
import {
  formatIsoTime,
  reviewOperationKindLabel,
  reviewOperationStatusClass,
} from "./activityPresentation.js";
import { ActivityDetailSection, ActivityFact, ActivityFactGrid } from "./ActivityDetailPrimitives.js";
import { operationDetailSummary } from "./operationDetailSummary.js";
import { WorkbenchDisclosure } from "../../components/workbench/WorkbenchPrimitives.js";

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

      <ActivityFactGrid className={reviewOperationFactGridClass()}>
        <ActivityFact label="Project Link">{operation.projectLinkName}</ActivityFact>
        <ActivityFact label="Repository" mono>{operation.repository}</ActivityFact>
        <ActivityFact label="Pull Request" mono>
          {operation.pullRequestId > 0 ? `#${operation.pullRequestId}` : "Queue-level operation"}
        </ActivityFact>
        <ActivityFact label="Actor">{operation.actor || "Not available"}</ActivityFact>
      </ActivityFactGrid>

      <ActivityDetailSection title="Details">
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
            <WorkbenchDisclosure label="Raw detail">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
                {operation.details}
              </pre>
            </WorkbenchDisclosure>
          </>
        )}
        {operation.details && !detailsShouldFold && (
          <p className="break-words text-sm text-[rgb(var(--app-text))]">
            {operation.details}
          </p>
        )}
      </ActivityDetailSection>
    </div>
  );
}

export function reviewOperationFactGridClass(): string {
  return "gap-3 text-sm grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))]";
}
