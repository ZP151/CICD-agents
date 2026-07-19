import type { ProjectLink } from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import {
  formatIsoTime,
  reviewOperationKindLabel,
  reviewOperationStatusClass,
} from "./activityPresentation.js";
import type { ReviewActivityItem } from "./activityTypes.js";
import { operationDetailPreview } from "./operationDetailSummary.js";
import { ProjectLinkFilter } from "./ProjectLinkFilter.js";

interface ReviewActivitySectionProps {
  projectLinks: ProjectLink[];
  reviewActivity: ReviewActivityItem[];
  reviewLoading: boolean;
  reviewProjectLinkFilter: string;
  reviewKindFilter: ReviewOperationEvent["kind"] | "all";
  selectedReviewId: string | null;
  onSelectReview: (eventId: string) => void;
  onReviewProjectLinkFilterChange: (value: string) => void;
  onReviewKindFilterChange: (value: ReviewOperationEvent["kind"] | "all") => void;
}

export function ReviewActivitySection({
  projectLinks,
  reviewActivity,
  reviewLoading,
  reviewProjectLinkFilter,
  reviewKindFilter,
  selectedReviewId,
  onSelectReview,
  onReviewProjectLinkFilterChange,
  onReviewKindFilterChange,
}: ReviewActivitySectionProps): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Review Operations
        </h3>
        <span className="rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 text-[11px] text-[rgb(var(--app-text-subtle))]">
          {reviewLoading ? "Loading" : reviewActivity.length}
        </span>
      </div>
      <div className="mb-2 grid gap-1.5">
        <ProjectLinkFilter
          projectLinks={projectLinks}
          value={reviewProjectLinkFilter}
          onChange={onReviewProjectLinkFilterChange}
          label="Filter review activity by Project Link"
        />
        <select
          className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-xs text-[rgb(var(--app-text-muted))] outline-none focus:border-[rgb(var(--app-accent))]"
          value={reviewKindFilter}
          onChange={(e) =>
            onReviewKindFilterChange(e.target.value as ReviewOperationEvent["kind"] | "all")
          }
          aria-label="Filter review activity by event type"
        >
          <option value="all">All review events</option>
          <option value="rerun">Rerun</option>
          <option value="batch_rerun">Batch rerun</option>
          <option value="stale_rerun">Stale rerun</option>
          <option value="disposition">Disposition</option>
          <option value="ado_retry">ADO retry</option>
          <option value="insight_preview">Insight preview</option>
          <option value="review_run">Review run</option>
        </select>
      </div>
      <div className="space-y-1.5">
        {!reviewLoading && reviewActivity.length === 0 && (
          <p className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
            No review operations yet.
          </p>
        )}
        {reviewActivity.slice(0, 12).map((event) => {
          const detailSummary = operationDetailPreview(event.details) ?? event.details;
          return (
            <button
              key={`${event.projectLinkId}-${event.id}`}
              onClick={() => onSelectReview(event.id)}
              className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                event.id === selectedReviewId
                  ? "border-[rgb(var(--app-accent))]/50 bg-[rgb(var(--app-accent-soft))]"
                  : "border-transparent hover:border-[rgb(var(--app-border))] hover:bg-[rgb(var(--app-surface-raised))]"
              }`}
            >
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${reviewOperationStatusClass(event.ok)}`}
                >
                  {reviewOperationKindLabel(event.kind)}
                </span>
                <span className="truncate text-xs text-[rgb(var(--app-text-muted))]">
                  {formatIsoTime(event.at)}
                </span>
              </div>
              <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]">
                {event.pullRequestId > 0 ? `#${event.pullRequestId} · ${event.label}` : event.label}
              </p>
              <p
                className="mt-1 truncate text-xs text-[rgb(var(--app-text-muted))]"
                title={event.details}
              >
                {event.projectLinkName}
                {detailSummary ? ` · ${detailSummary}` : ""}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
