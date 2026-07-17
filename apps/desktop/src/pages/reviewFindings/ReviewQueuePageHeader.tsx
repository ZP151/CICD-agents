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
          <h2 className="text-2xl font-semibold text-[rgb(var(--app-text))]">Review Queue</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
            Approval and quality queue for the selected Project Link. Decisions come from
            Review Agent history, including auto-approval audit records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Review Queue Project Link"
            className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] outline-none transition focus:border-[rgb(var(--app-border-strong))] focus:ring-2 focus:ring-[rgb(var(--app-accent))]/20 disabled:cursor-not-allowed disabled:opacity-60"
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
            className="rounded-md border border-[rgb(var(--app-border))] px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          >
            Refresh
          </button>
        </div>
      </header>

      {selectedProjectLink && (
        <div className="flex flex-wrap gap-2 text-xs text-[rgb(var(--app-text-muted))]">
          <span className="rounded-full border border-[rgb(var(--app-border))] px-2 py-1">{selectedProjectLink.adoProject || "No project"}</span>
          <span className="rounded-full border border-[rgb(var(--app-border))] px-2 py-1">{selectedProjectLink.adoRepoName || "No repo"}</span>
          <span className="rounded-full border border-[rgb(var(--app-border))] px-2 py-1">target: {selectedProjectLink.targetBranch || "main"}</span>
        </div>
      )}
    </>
  );
}
