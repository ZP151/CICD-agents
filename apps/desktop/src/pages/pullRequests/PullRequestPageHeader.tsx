import type { ProjectLink } from "../../api.js";
import {
  ActionButton,
  WorkbenchHeader,
  WorkbenchSelect,
} from "../../components/workbench/WorkbenchPrimitives.js";
import { ProjectLinkContextHint } from "../projectLinks/ProjectLinkContextHint.js";

const projectLinkSelectClass = "truncate text-sm sm:min-w-[14rem]";
const statusSelectClass = "text-sm sm:w-[9rem]";

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
      <WorkbenchHeader
        title="Pull Requests"
        description="Triage active changes, inspect evidence, and decide what needs human review."
        descriptionClassName="hidden max-w-2xl xl:block"
        actions={<div className={pullRequestHeaderControlsClass()}>
          <WorkbenchSelect
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
          </WorkbenchSelect>
          <WorkbenchSelect
            aria-label="Pull Requests status"
            className={statusSelectClass}
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="abandoned">Abandoned</option>
            <option value="all">All</option>
          </WorkbenchSelect>
          <ActionButton onClick={onRefresh}>Refresh</ActionButton>
        </div>}
      />

      {selectedProjectLink && (
        <ProjectLinkContextHint projectLink={selectedProjectLink} branchFallback={branchScope} />
      )}
    </>
  );
}
