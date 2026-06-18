import type { ProjectLink } from "../../api.js";

export interface ReviewQueuePageHeaderProps {
  projectLinks: ProjectLink[];
  projectLinksLoading: boolean;
  projectLinkId: string;
  selectedProjectLink: ProjectLink | null;
  onProjectLinkChange: (projectLinkId: string) => void;
  onRefresh: () => void;
}

export function ReviewQueuePageHeader({
  projectLinks,
  projectLinksLoading,
  projectLinkId,
  selectedProjectLink,
  onProjectLinkChange,
  onRefresh,
}: ReviewQueuePageHeaderProps): JSX.Element {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100">Review Queue</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Approval and quality queue for the selected Project Link. Decisions come from
            Review Agent history, including auto-approval audit records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 outline-none"
            value={projectLinkId}
            disabled={projectLinksLoading || projectLinks.length === 0}
            onChange={(e) => onProjectLinkChange(e.target.value)}
          >
            {projectLinks.length === 0 && <option value="">No Project Links</option>}
            {projectLinks.map((projectLink) => (
              <option key={projectLink.id} value={projectLink.id}>{projectLink.name}</option>
            ))}
          </select>
          <button
            onClick={onRefresh}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>
      </header>

      {selectedProjectLink && (
        <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
          <span className="rounded-full border border-zinc-800 px-2 py-1">{selectedProjectLink.adoProject || "No project"}</span>
          <span className="rounded-full border border-zinc-800 px-2 py-1">{selectedProjectLink.adoRepoName || "No repo"}</span>
          <span className="rounded-full border border-zinc-800 px-2 py-1">target: {selectedProjectLink.targetBranch || "main"}</span>
        </div>
      )}
    </>
  );
}
