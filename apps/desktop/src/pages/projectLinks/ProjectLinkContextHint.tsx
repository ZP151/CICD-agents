import type { ProjectLink } from "../../api.js";
import {
  compactProjectLinkAdoScope,
  compactProjectLinkBranchScope,
} from "./ProjectLinkCard.js";

export function projectLinkContextText(
  projectLink: ProjectLink,
  branchFallback = "",
): string {
  const adoScope = compactProjectLinkAdoScope(projectLink) || "Connection needs setup";
  const branchScope = compactProjectLinkBranchScope(projectLink)
    || `target: ${projectLink.targetBranch || branchFallback || "main"}`;
  return `${adoScope} · ${branchScope}`;
}

export function projectLinkContextTitle(
  projectLink: ProjectLink,
  branchFallback = "",
): string {
  const connectionDetail = [
    projectLink.adoOrgUrl,
    projectLink.adoProject,
    projectLink.adoRepoName,
  ].filter(Boolean).join(" / ") || "Azure DevOps connection needs setup";
  const defaultBranch = projectLink.defaultBranch || branchFallback || "not set";
  const targetBranch = projectLink.targetBranch || "main";
  return `${connectionDetail} · Default branch: ${defaultBranch}; PR target: ${targetBranch}`;
}

/** A single quiet line replaces repeated connection and branch chips in worklists. */
export function ProjectLinkContextHint({
  projectLink,
  branchFallback,
}: {
  projectLink: ProjectLink;
  branchFallback?: string;
}): JSX.Element {
  return (
    <p
      className="min-w-0 truncate text-xs text-[rgb(var(--app-text-muted))]"
      title={projectLinkContextTitle(projectLink, branchFallback)}
    >
      {projectLinkContextText(projectLink, branchFallback)}
    </p>
  );
}
