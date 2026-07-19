import type { ProjectLink } from "../../api";

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

  return (
    <div className="group flex min-w-0 flex-col gap-3 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2.5 transition hover:border-[rgb(var(--app-border-strong))] sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="truncate text-sm font-medium text-[rgb(var(--app-text))]"
          title={projectLink.name}
        >
          {nameLabel}
        </span>
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
              className="min-w-0 max-w-full truncate rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-xs text-[rgb(var(--app-text-muted))]"
              title={[projectLink.adoOrgUrl, projectLink.adoProject, projectLink.adoRepoName]
                .filter(Boolean)
                .join(" / ")}
            >
              {adoScope}
            </span>
          )}
          {branchScope && (
            <span
              className="min-w-0 max-w-full truncate rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 text-xs text-[rgb(var(--app-text-subtle))]"
              title={`Default branch: ${projectLink.defaultBranch || "not set"}; PR target: ${projectLink.targetBranch || "not set"}`}
            >
              {branchScope}
            </span>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1 opacity-100 transition sm:ml-3 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${projectLink.name}`}
          title="Edit Project Link"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/30"
        >
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none">
            <path
              d="M4 14.5V16h1.5L15 6.5 13.5 5 4 14.5Z"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
            <path
              d="m12.75 5.75 1.5-1.5a1.4 1.4 0 0 1 2 0l.5.5a1.4 1.4 0 0 1 0 2l-1.5 1.5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${projectLink.name}`}
          title="Delete Project Link"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-danger))] hover:text-[rgb(var(--app-danger))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-danger))]/25"
        >
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 20 20" fill="none">
            <path
              d="M4.5 6h11M8 6V4.75A1.25 1.25 0 0 1 9.25 3.5h1.5A1.25 1.25 0 0 1 12 4.75V6m2.25 0-.55 9.1a1.5 1.5 0 0 1-1.5 1.4H7.8a1.5 1.5 0 0 1-1.5-1.4L5.75 6M8.75 8.75v5M11.25 8.75v5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </button>
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
