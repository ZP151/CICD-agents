import type { ProjectLink } from "../../api.js";
import {
  ActionButton,
  WorkbenchHeader,
  WorkbenchSelect,
} from "../../components/workbench/WorkbenchPrimitives.js";
import {
  compactProjectLinkName,
} from "../projectLinks/ProjectLinkCard.js";
import { ProjectLinkContextHint } from "../projectLinks/ProjectLinkContextHint.js";

const projectLinkSelectClass = "truncate text-sm";

export function reviewQueueHeaderControlsClass(): string {
  return [
    "grid w-full min-w-0 grid-cols-1 gap-2",
    "sm:grid-cols-[minmax(0,1fr)_auto]",
    "xl:w-[clamp(24rem,36vw,36rem)]",
  ].join(" ");
}

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
  const selectedNameTitle = selectedProjectLink?.name || undefined;
  return (
    <>
      <WorkbenchHeader
        title="Review Queue"
        description="Approval and quality decisions from Review Agent history, including persisted audit records."
        descriptionClassName="hidden max-w-2xl xl:block"
        actions={<div className={reviewQueueHeaderControlsClass()}>
          <WorkbenchSelect
            aria-label="Review Queue Project Link"
            className={projectLinkSelectClass}
            value={projectLinkId}
            title={selectedNameTitle}
            disabled={projectLinksLoading || projectLinks.length === 0}
            onChange={(e) => onProjectLinkChange(e.target.value)}
          >
            {projectLinks.length === 0 && <option value="">No Project Links</option>}
            {projectLinks.map((projectLink) => (
              <option key={projectLink.id} value={projectLink.id} title={projectLink.name}>
                {compactProjectLinkName(projectLink.name)}
              </option>
            ))}
          </WorkbenchSelect>
          <ActionButton onClick={onRefresh}>Refresh</ActionButton>
        </div>}
      />

      {selectedProjectLink && <ProjectLinkContextHint projectLink={selectedProjectLink} />}
    </>
  );
}
