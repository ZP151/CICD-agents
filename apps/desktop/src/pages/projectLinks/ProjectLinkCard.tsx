import type { ProjectLink } from "../../api";
import { ActionButton } from "../../components/workbench/WorkbenchPrimitives.js";

export function ProjectLinkCard({
  projectLink,
  onEdit,
  onDelete,
}: {
  projectLink: ProjectLink;
  onEdit: () => void;
  onDelete: () => void;
}): JSX.Element {
  const nameLabel = compactProjectLinkName(projectLink.name);
  const repoLabel = compactProjectLinkRepoLabel(projectLink.repoPath);
  const adoScope = compactProjectLinkAdoScope(projectLink);
  const branchScope = compactProjectLinkBranchScope(projectLink);
  const connection = projectLinkConnectionState(projectLink);

  return (
    <div className="group flex min-w-0 flex-col gap-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2.5 transition hover:border-[rgb(var(--app-border-strong))] sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="min-w-0 flex-1 truncate text-sm font-medium text-[rgb(var(--app-text))]"
            title={projectLink.name}
          >
            {nameLabel}
          </span>
          <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] ${connection.className}`} title={connection.detail}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {connection.label}
          </span>
        </div>
        {repoLabel && (
          <span
            className="truncate font-mono text-xs text-[rgb(var(--app-text-muted))]"
            title={projectLink.repoPath}
          >
            {repoLabel}
          </span>
        )}
        <div className="mt-1 flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {adoScope && (
            <span
              className="min-w-0 max-w-full truncate text-xs text-[rgb(var(--app-text-muted))]"
              title={[projectLink.adoOrgUrl, projectLink.adoProject, projectLink.adoRepoName]
                .filter(Boolean)
                .join(" / ")}
            >
              {adoScope}
            </span>
          )}
          {branchScope && (
            <span
              className="min-w-0 max-w-full truncate text-xs text-[rgb(var(--app-text-subtle))]"
              title={`Default branch: ${projectLink.defaultBranch || "not set"}; PR target: ${projectLink.targetBranch || "not set"}`}
            >
              {branchScope}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5 text-[rgb(var(--app-text-muted))] sm:ml-3">
        <ActionButton
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${projectLink.name}`}
          title="Edit Project Link"
          tone="quiet"
          className="h-10 w-10 shrink-0 rounded-md bg-[rgb(var(--app-surface-raised))] px-0 text-[rgb(var(--app-text))] hover:bg-[rgb(var(--app-control-hover))]"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 14.5V16h1.5L15 6.5 13.5 5 4 14.5Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <path
              d="m12.75 5.75 1.5-1.5a1.4 1.4 0 0 1 2 0l.5.5a1.4 1.4 0 0 1 0 2l-1.5 1.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </ActionButton>
        <ActionButton
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${projectLink.name}`}
          title="Delete Project Link"
          tone="quiet"
          className="h-10 w-10 shrink-0 rounded-md bg-[rgb(var(--app-surface-raised))] px-0 text-[rgb(var(--app-text))] hover:bg-[rgb(var(--app-danger-soft))] hover:text-[rgb(var(--app-danger))] focus-visible:ring-[rgb(var(--app-danger))]/30"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M4.5 6h11M8 6V4.75A1.25 1.25 0 0 1 9.25 3.5h1.5A1.25 1.25 0 0 1 12 4.75V6m2.25 0-.55 9.1a1.5 1.5 0 0 1-1.5 1.4H7.8a1.5 1.5 0 0 1-1.5-1.4L5.75 6M8.75 8.75v5M11.25 8.75v5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        </ActionButton>
      </div>
    </div>
  );
}

export function compactProjectLinkName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Untitled Project Link";
  const timestampMatch = /^(.+)-(\d{10,})$/.exec(trimmed);
  if (timestampMatch) {
    const [, rawBase = "", rawStamp = ""] = timestampMatch;
    const base = rawBase.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
    const stamp = rawStamp.slice(-4);
    return `${base} · ${stamp}`;
  }
  if (trimmed.length <= 42) return trimmed;
  return `${trimmed.slice(0, 39).trimEnd()}...`;
}

export function compactProjectLinkRepoLabel(repoPath: string): string {
  const trimmed = repoPath.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? trimmed;
}

export function compactProjectLinkAdoScope(projectLink: Pick<ProjectLink, "adoProject" | "adoRepoName">): string {
  if (projectLink.adoProject && projectLink.adoRepoName) {
    return `${projectLink.adoProject} / ${projectLink.adoRepoName}`;
  }
  return projectLink.adoProject || projectLink.adoRepoName || "";
}

export function compactProjectLinkBranchScope(
  projectLink: Pick<ProjectLink, "defaultBranch" | "targetBranch">,
): string {
  if (projectLink.defaultBranch && projectLink.targetBranch) {
    return `${projectLink.defaultBranch} -> ${projectLink.targetBranch}`;
  }
  return projectLink.defaultBranch || projectLink.targetBranch || "";
}

export function projectLinkConnectionState(
  projectLink: Pick<ProjectLink, "repoPath" | "adoOrgUrl" | "adoProject" | "adoRepoName">,
): { label: string; detail: string; className: string } {
  const hasRepository = Boolean(projectLink.repoPath.trim());
  const hasAdo = Boolean(projectLink.adoOrgUrl.trim() && projectLink.adoProject.trim() && projectLink.adoRepoName.trim());
  if (hasRepository && hasAdo) {
    return {
      label: "Connected",
      detail: "Local repository and Azure DevOps mapping are configured.",
      className: "text-[rgb(var(--app-success))]",
    };
  }
  if (hasRepository) {
    return {
      label: "Local only",
      detail: "A local repository is configured, but Azure DevOps mapping is incomplete.",
      className: "text-[rgb(var(--app-warning))]",
    };
  }
  return {
    label: "Setup needed",
    detail: "Add a local repository and Azure DevOps mapping before using workspace workflows.",
    className: "text-[rgb(var(--app-text-subtle))]",
  };
}
