import type {
  PrInsightArtifactHistoryMeta,
  PrInsightArtifactRecord,
  ProjectLink,
} from "../../api.js";
import { formatTime } from "./activityPresentation.js";
import { ProjectLinkFilter } from "./ProjectLinkFilter.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";

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
    <div className="mt-5 border-t border-zinc-800/70 pt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Saved PR Insights
        </h3>
        {prInsightLoading && <span className="text-[11px] text-zinc-700">Loading</span>}
      </div>
      <div className="mb-2 grid gap-1.5">
        <ProjectLinkFilter
          projectLinks={projectLinks}
          value={prInsightProjectLinkFilter}
          onChange={onPrInsightProjectLinkFilterChange}
          label="Filter saved PR insights by Project Link"
        />
        <select
          className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-400 outline-none"
          value={prInsightKindFilter}
          onChange={(e) =>
            onPrInsightKindFilterChange(e.target.value as PrInsightArtifactRecord["kind"] | "all")
          }
          aria-label="Filter saved PR insights by artifact type"
        >
          <option value="all">All saved insight types</option>
          <option value="insight_preview">Insight preview</option>
          <option value="review_run">Full review</option>
        </select>
      </div>
      <div className="max-h-[260px] overflow-y-auto space-y-1.5">
        {!prInsightLoading && prInsightActivity.length === 0 && (
          <p className="px-1 text-xs text-zinc-600">No saved PR insights yet.</p>
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
    <button
      key={event.id}
      onClick={() => onSelectPrInsight(event.id)}
      className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
        selected
          ? "border-zinc-700 bg-zinc-900"
          : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300 ring-1 ring-blue-500/20">
          {event.kind === "review_run" ? "full review" : "preview"}
        </span>
        {historyMeta && historyMeta.total > 1 && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] ring-1 ${
              historyMeta.latest
                ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20"
                : "bg-zinc-800/70 text-zinc-500 ring-zinc-700"
            }`}
          >
            {historyMeta.latest
              ? `latest of ${historyMeta.total}`
              : `older ${historyMeta.index + 1}/${historyMeta.total}`}
          </span>
        )}
        <span className="truncate text-xs text-zinc-600">
          {formatTime(Date.parse(event.at || "0") / 1000)}
        </span>
      </div>
      <p className="truncate text-sm font-medium text-zinc-200">
        #{event.pullRequestId} · {event.title || "(untitled)"}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-600">
        {event.projectLinkName} · {event.repository}
      </p>
    </button>
  );
}
