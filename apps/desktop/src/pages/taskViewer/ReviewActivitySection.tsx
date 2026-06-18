import type { ProjectLink } from "../../api.js";
import type { ReviewOperationEvent } from "../../reviewOperations.js";
import {
  formatTime,
  reviewOperationKindLabel,
  reviewOperationStatusClass,
} from "./activityPresentation.js";
import type { ReviewActivityItem } from "./activityTypes.js";
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
    <div className="mt-5 border-t border-zinc-800/70 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Review Activity
        </h3>
        {reviewLoading && <span className="text-[11px] text-zinc-700">Loading</span>}
      </div>
      <div className="mb-2 grid gap-1.5">
        <ProjectLinkFilter
          projectLinks={projectLinks}
          value={reviewProjectLinkFilter}
          onChange={onReviewProjectLinkFilterChange}
          label="Filter review activity by Project Link"
        />
        <select
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 outline-none"
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
      <div className="max-h-[320px] overflow-y-auto space-y-1.5">
        {!reviewLoading && reviewActivity.length === 0 && (
          <p className="px-1 text-xs text-zinc-600">No review operations yet.</p>
        )}
        {reviewActivity.slice(0, 12).map((event) => (
          <button
            key={`${event.projectLinkId}-${event.id}`}
            onClick={() => onSelectReview(event.id)}
            className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
              event.id === selectedReviewId
                ? "border-zinc-700 bg-zinc-900"
                : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
            }`}
          >
            <div className="mb-1 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${reviewOperationStatusClass(event.ok)}`}
              >
                {reviewOperationKindLabel(event.kind)}
              </span>
              <span className="truncate text-xs text-zinc-600">
                {formatTime(Date.parse(event.at || "0") / 1000)}
              </span>
            </div>
            <p className="truncate text-sm font-medium text-zinc-200">
              {event.pullRequestId > 0 ? `#${event.pullRequestId} · ${event.label}` : event.label}
            </p>
            <p className="mt-1 truncate text-xs text-zinc-600">
              {event.projectLinkName} · {event.details}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
