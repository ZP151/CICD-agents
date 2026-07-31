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
  compactProjectLinkName,
} from "../projectLinks/ProjectLinkCard.js";

const projectLinkSelectClass =
  "w-full min-w-0 truncate rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-sm text-[rgb(var(--app-text-muted))] outline-none transition focus:border-[rgb(var(--app-border-strong))] focus:ring-2 focus:ring-[rgb(var(--app-accent))]/20 disabled:cursor-not-allowed disabled:opacity-60";

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
  const selectedAdoScope = selectedProjectLink ? compactProjectLinkAdoScope(selectedProjectLink) : "";
  const selectedBranchScope = selectedProjectLink
    ? compactProjectLinkBranchScope(selectedProjectLink)
    : "";

  return (
    <>
      <WorkbenchHeader
        title="Review Queue"
        description="Approval and quality decisions from Review Agent history, including persisted audit records."
        descriptionClassName="hidden max-w-2xl xl:block"
        actions={<div className={reviewQueueHeaderControlsClass()}>
          <select
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
          </select>
          <ActionButton onClick={onRefresh}>Refresh</ActionButton>
        </div>}
      />

      {selectedProjectLink && (
        <WorkbenchToolbar className="text-xs text-[rgb(var(--app-text-muted))]">
          <StatusBadge
            className="max-w-full truncate rounded-full border border-[rgb(var(--app-border))] px-2 py-1"
            title={[
              selectedProjectLink.adoOrgUrl,
              selectedProjectLink.adoProject,
              selectedProjectLink.adoRepoName,
            ]
              .filter(Boolean)
              .join(" / ")}
          >
            {selectedAdoScope || "No ADO mapping"}
          </StatusBadge>
          <StatusBadge
            className="max-w-full truncate rounded-full border border-[rgb(var(--app-border))] px-2 py-1"
            title={`Default branch: ${selectedProjectLink.defaultBranch || "not set"}; PR target: ${selectedProjectLink.targetBranch || "main"}`}
          >
            {selectedBranchScope || "target: main"}
          </StatusBadge>
        </WorkbenchToolbar>
      )}
    </>
  );
}
