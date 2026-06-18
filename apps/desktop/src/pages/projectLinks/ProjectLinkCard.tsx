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
  return (
    <div className="group flex items-start justify-between rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 transition hover:border-zinc-700">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-medium text-zinc-100">{projectLink.name}</span>
        {projectLink.repoPath && (
          <span className="truncate font-mono text-xs text-zinc-500">{projectLink.repoPath}</span>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {projectLink.adoOrgUrl && (
            <span className="truncate text-xs text-zinc-600">{projectLink.adoOrgUrl}</span>
          )}
          {projectLink.adoProject && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
              {projectLink.adoProject}
            </span>
          )}
          {projectLink.defaultBranch && (
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">
              branch: {projectLink.defaultBranch}
            </span>
          )}
        </div>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-2 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-300 transition hover:bg-zinc-700"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-400 transition hover:bg-red-900 hover:text-red-300"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
