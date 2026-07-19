import type { ProjectLink } from "../../api.js";
import {
  compactProjectLinkAdoScope,
  compactProjectLinkBranchScope,
} from "../projectLinks/ProjectLinkCard.js";

const pageSelectClass =
  "min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] outline-none transition focus:border-[rgb(var(--app-border-strong))] focus:ring-2 focus:ring-[rgb(var(--app-accent))]/20 disabled:cursor-not-allowed disabled:opacity-60";
const projectLinkSelectClass = `${pageSelectClass} w-full truncate sm:min-w-[14rem]`;
const statusSelectClass = `${pageSelectClass} w-full sm:w-[9rem]`;

export function pullRequestHeaderControlsClass(): string {
  return [
    "grid w-full min-w-0 grid-cols-1 gap-2",
    "sm:grid-cols-[minmax(0,1fr)_9rem_auto]",
    "xl:w-[clamp(30rem,42vw,38rem)]",
  ].join(" ");
}

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
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgb(var(--app-border))] pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-semibold text-[rgb(var(--app-text))]">Pull Requests</h2>
          <p className="mt-2 hidden max-w-2xl text-sm leading-relaxed text-[rgb(var(--app-text-muted))] xl:block">
            Developer workspace for active PRs, review state, and AI insight. CI/CD execution
            now lives in the dedicated Pipelines workspace.
          </p>
        </div>
        <div className={pullRequestHeaderControlsClass()}>
          <select
            aria-label="Pull Requests Project Link"
            className={projectLinkSelectClass}
            value={projectLinkId}
            disabled={projectLinksLoading || projectLinks.length === 0}
            onChange={(e) => onProjectLinkChange(e.target.value)}
          >
            {projectLinks.length === 0 && (
              <option value="">
                {projectLinksLoading ? "Loading Project Links..." : "No Project Links"}
              </option>
            )}
            {projectLinks.length > 0 && <option value="">All Project Links</option>}
            {projectLinks.map((projectLink) => (
              <option key={projectLink.id} value={projectLink.id}>{projectLink.name}</option>
            ))}
          </select>
          <select
            aria-label="Pull Requests status"
            className={statusSelectClass}
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
            className="rounded-md border border-[rgb(var(--app-border))] px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
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
    const adoScope = compactProjectLinkAdoScope(selectedProjectLink);
    const branchLabel = compactProjectLinkBranchScope(selectedProjectLink) || "target: main";
    return (
      <div className="flex flex-wrap gap-2 text-xs text-[rgb(var(--app-text-muted))]">
        <span
          className="max-w-full truncate rounded-full border border-[rgb(var(--app-border))] px-2 py-1"
          title={[
            selectedProjectLink.adoOrgUrl,
            selectedProjectLink.adoProject,
            selectedProjectLink.adoRepoName,
          ]
            .filter(Boolean)
            .join(" / ")}
        >
          {adoScope || "No ADO mapping"}
        </span>
        <span
          className="max-w-full truncate rounded-full border border-[rgb(var(--app-border))] px-2 py-1"
          title={`Default branch: ${selectedProjectLink.defaultBranch || branchScope || "not set"}; PR target: ${selectedProjectLink.targetBranch || "main"}`}
        >
          {branchLabel}
        </span>
      </div>
    );
  }

  if (projectLinks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs text-[rgb(var(--app-text-muted))]">
      <span className="rounded-full border border-[rgb(var(--app-border))] px-2 py-1">All Project Links</span>
      <span className="rounded-full border border-[rgb(var(--app-border))] px-2 py-1">status: {status}</span>
    </div>
  );
}
