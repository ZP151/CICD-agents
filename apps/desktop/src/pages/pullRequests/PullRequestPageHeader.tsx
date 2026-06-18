import type { ProjectLink } from "../../api.js";

const pageSelectClass =
  "rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] outline-none transition focus:border-[rgb(var(--app-border-strong))] focus:ring-2 focus:ring-[rgb(var(--app-accent))]/20 disabled:cursor-not-allowed disabled:opacity-60";

export interface PullRequestPageHeaderProps {
  projectLinks: ProjectLink[];
  projectLinksLoading: boolean;
  projectLinkId: string;
  status: string;
  selectedProjectLink: ProjectLink | null;
  branchScope: string;
  onProjectLinkChange: (projectLinkId: string) => void;
  onStatusChange: (status: string) => void;
  onRefresh: () => void;
}

export function PullRequestPageHeader({
  projectLinks,
  projectLinksLoading,
  projectLinkId,
  status,
  selectedProjectLink,
  branchScope,
  onProjectLinkChange,
  onStatusChange,
  onRefresh,
}: PullRequestPageHeaderProps): JSX.Element {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/70 pb-4">
        <div>
          <h2 className="text-2xl font-semibold text-zinc-100">Pull Requests</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Developer workspace for active PRs, review state, and AI insight. CI/CD execution
            now lives in the dedicated Pipelines workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className={pageSelectClass}
            value={projectLinkId}
            disabled={projectLinksLoading || projectLinks.length === 0}
            onChange={(e) => onProjectLinkChange(e.target.value)}
          >
            {projectLinks.length === 0 && <option value="">No Project Links</option>}
            {projectLinks.length > 0 && <option value="">All Project Links</option>}
            {projectLinks.map((projectLink) => (
              <option key={projectLink.id} value={projectLink.id}>{projectLink.name}</option>
            ))}
          </select>
          <select
            className={pageSelectClass}
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Abandoned</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={onRefresh}
            className="rounded-md border border-zinc-800 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-zinc-700 hover:text-zinc-300"
          >
            Refresh
          </button>
        </div>
      </header>

      <PullRequestScopeBadges
        projectLinks={projectLinks}
        selectedProjectLink={selectedProjectLink}
        branchScope={branchScope}
        status={status}
      />
    </>
  );
}

function PullRequestScopeBadges({
  projectLinks,
  selectedProjectLink,
  branchScope,
  status,
}: {
  projectLinks: ProjectLink[];
  selectedProjectLink: ProjectLink | null;
  branchScope: string;
  status: string;
}): JSX.Element | null {
  if (selectedProjectLink) {
    return (
      <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
        <span className="rounded-full border border-zinc-800 px-2 py-1">{selectedProjectLink.adoProject || "No project"}</span>
        <span className="rounded-full border border-zinc-800 px-2 py-1">{selectedProjectLink.adoRepoName || "No repo"}</span>
        {branchScope && branchScope !== "main" && (
          <span className="rounded-full border border-zinc-800 px-2 py-1">branch: {selectedProjectLink.defaultBranch}</span>
        )}
        <span className="rounded-full border border-zinc-800 px-2 py-1">target: {selectedProjectLink.targetBranch || "main"}</span>
      </div>
    );
  }

  if (projectLinks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
      <span className="rounded-full border border-zinc-800 px-2 py-1">All Project Links</span>
      <span className="rounded-full border border-zinc-800 px-2 py-1">status: {status}</span>
    </div>
  );
}
