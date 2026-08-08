import type { ProjectLink } from "../../api.js";
import {
  ActionButton,
  ActionLink,
  WorkbenchHeader,
  WorkbenchSelect,
} from "../../components/workbench/WorkbenchPrimitives.js";
import { ProjectLinkContextHint } from "../projectLinks/ProjectLinkContextHint.js";

const statusSelectClass = "text-sm sm:w-[9rem]";

export function pullRequestHeaderControlsClass(): string {
  return [
    "grid w-full min-w-0 grid-cols-1 gap-2",
    "sm:grid-cols-[minmax(0,1fr)_9rem_auto]",
    "xl:w-[clamp(30rem,42vw,38rem)]",
  ].join(" ");
}
export interface PullRequestPageHeaderProps {
  status: string;
  selectedProjectLink: ProjectLink | null;
  branchScope: string;
  onStatusChange: (status: string) => void;
  onRefresh: () => void;
  onCreatePr: () => void;
}

export function PullRequestPageHeader({
  status,
  selectedProjectLink,
  branchScope,
  onStatusChange,
  onRefresh,
  onCreatePr,
}: PullRequestPageHeaderProps): JSX.Element {
  return (
    <>
      <WorkbenchHeader
        title="Pull Requests"
        description="Triage active changes, inspect evidence, and decide what needs human review."
        descriptionClassName="hidden max-w-2xl xl:block"
        actions={<div className={pullRequestHeaderControlsClass()}>
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
          <ActionButton tone="primary" onClick={onCreatePr}>Create PR</ActionButton>
        </div>}
      />

      {selectedProjectLink && (
        <ProjectLinkContextHint projectLink={selectedProjectLink} branchFallback={branchScope} />
      )}
    </>
  );
}
