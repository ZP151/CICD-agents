import type { ProjectLink } from "../../api.js";
import {
  ActionButton,
  StatusBadge,
  WorkbenchHeader,
  WorkbenchToolbar,
} from "../../components/workbench/WorkbenchPrimitives.js";
import {
  compactProjectLinkAdoScope,
  compactProjectLinkBranchScope,
} from "../projectLinks/ProjectLinkCard.js";

const pageSelectClass =
  "min-w-0 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-sm text-[rgb(var(--app-text))] outline-none transition focus:border-[rgb(var(--app-focus))] focus:ring-2 focus:ring-[rgb(var(--app-focus))]/20 disabled:cursor-not-allowed disabled:opacity-60";
const projectLinkSelectClass = `${pageSelectClass} w-full truncate sm:min-w-[14rem]`;
const statusSelectClass = `${pageSelectClass} w-full sm:w-[9rem]`;

export function pullRequestHeaderControlsClass(): string {
  return [
    "grid w-full min-w-0 grid-cols-1 gap-2 rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-2",
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
      <WorkbenchHeader
        title="Pull Requests"
        description="Triage active changes, inspect evidence, and decide what needs human review."
        descriptionClassName="hidden max-w-2xl xl:block"
        actions={<div className={pullRequestHeaderControlsClass()}>
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
          <ActionButton onClick={onRefresh}>Refresh</ActionButton>
        </div>}
      />

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
      <WorkbenchToolbar className="text-xs text-[rgb(var(--app-text-muted))]">
        <StatusBadge
          className="max-w-full truncate rounded-full px-2.5 py-1"
          title={[
            selectedProjectLink.adoOrgUrl,
            selectedProjectLink.adoProject,
            selectedProjectLink.adoRepoName,
          ]
            .filter(Boolean)
            .join(" / ")}
        >
          {adoScope || "No ADO mapping"}
        </StatusBadge>
        <StatusBadge
          className="max-w-full truncate rounded-full px-2.5 py-1"
          title={`Default branch: ${selectedProjectLink.defaultBranch || branchScope || "not set"}; PR target: ${selectedProjectLink.targetBranch || "main"}`}
        >
          {branchLabel}
        </StatusBadge>
      </WorkbenchToolbar>
    );
  }

  if (projectLinks.length === 0) return null;
  return (
    <WorkbenchToolbar>
      <StatusBadge>All Project Links</StatusBadge>
      <StatusBadge>status: {status}</StatusBadge>
    </WorkbenchToolbar>
  );
}
