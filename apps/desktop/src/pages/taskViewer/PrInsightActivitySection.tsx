import type {
  PrInsightArtifactHistoryMeta,
  PrInsightArtifactRecord,
  ProjectLink,
} from "../../api.js";
import { formatIsoTime } from "./activityPresentation.js";
import { ProjectLinkFilter } from "./ProjectLinkFilter.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";
import { WorkbenchListItemButton, WorkbenchSelect } from "../../components/workbench/WorkbenchPrimitives.js";

interface PrInsightActivitySectionProps {
  projectLinks: ProjectLink[];
  prInsightActivity: PrInsightActivityItem[];
  prInsightLoading: boolean;
  prInsightProjectLinkFilter: string;
  prInsightKindFilter: PrInsightArtifactRecord["kind"] | "all";
  prInsightHistoryMeta: Map<
    string,
    Pick<PrInsightArtifactHistoryMeta, "index" | "total" | "latest">
  >;
  selectedPrInsightId: string | null;
  onSelectPrInsight: (eventId: string) => void;
  onPrInsightProjectLinkFilterChange: (value: string) => void;
  onPrInsightKindFilterChange: (value: PrInsightArtifactRecord["kind"] | "all") => void;
}

export function PrInsightActivitySection({
  projectLinks,
  prInsightActivity,
  prInsightLoading,
  prInsightProjectLinkFilter,
  prInsightKindFilter,
  prInsightHistoryMeta,
  selectedPrInsightId,
  onSelectPrInsight,
  onPrInsightProjectLinkFilterChange,
  onPrInsightKindFilterChange,
}: PrInsightActivitySectionProps): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          PR Insights
        </h3>
        <span className="rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 text-[11px] text-[rgb(var(--app-text-subtle))]">
          {prInsightLoading ? "Loading" : prInsightActivity.length}
        </span>
      </div>
      <div className="mb-2 grid gap-1.5">
        <ProjectLinkFilter
          projectLinks={projectLinks}
          value={prInsightProjectLinkFilter}
          label="Filter saved PR insights by Project Link"
        />
        <WorkbenchSelect
          className="min-h-8 px-2 py-1 text-xs text-[rgb(var(--app-text-muted))]"
          value={prInsightKindFilter}
          onChange={(e) =>
            onPrInsightKindFilterChange(e.target.value as PrInsightArtifactRecord["kind"] | "all")
          }
          aria-label="Filter saved PR insights by artifact type"
        >
          <option value="all">All saved insight types</option>
          <option value="insight_preview">Insight preview</option>
          <option value="review_run">Full review</option>
        </WorkbenchSelect>
      </div>
      <div className="space-y-1.5">
        {!prInsightLoading && prInsightActivity.length === 0 && (
          <p className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text-muted))]">
            No saved PR insights yet.
          </p>
        )}
        {prInsightActivity.slice(0, 10).map((event) => (
          <PrInsightActivityButton
            key={event.id}
            event={event}
            selected={event.id === selectedPrInsightId}
            historyMeta={prInsightHistoryMeta.get(event.id)}
            onSelectPrInsight={onSelectPrInsight}
          />
        ))}
      </div>
    </div>
  );
}

function PrInsightActivityButton({
  event,
  selected,
  historyMeta,
  onSelectPrInsight,
}: {
  event: PrInsightActivityItem;
  selected: boolean;
  historyMeta?: Pick<PrInsightArtifactHistoryMeta, "index" | "total" | "latest">;
  onSelectPrInsight: (eventId: string) => void;
}): JSX.Element {
  return (
    <WorkbenchListItemButton
      key={event.id}
      onClick={() => onSelectPrInsight(event.id)}
      selected={selected}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-[rgb(var(--app-accent-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-accent-readable))] ring-1 ring-[rgb(var(--app-border-strong))]">
          {event.kind === "review_run" ? "full review" : "preview"}
        </span>
        {historyMeta && historyMeta.total > 1 && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${
              historyMeta.latest
                ? "bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success-border))]"
                : "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]"
            }`}
          >
            {historyMeta.latest
              ? `latest of ${historyMeta.total}`
              : `older ${historyMeta.index + 1}/${historyMeta.total}`}
          </span>
        )}
        <span className="truncate text-xs text-[rgb(var(--app-text-muted))]">
          {formatIsoTime(event.at)}
        </span>
      </div>
      <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]">
        #{event.pullRequestId} · {event.title || "(untitled)"}
      </p>
      <p className="mt-1 truncate text-xs text-[rgb(var(--app-text-muted))]">
        {event.projectLinkName} · {event.repository}
      </p>
    </WorkbenchListItemButton>
  );
}
