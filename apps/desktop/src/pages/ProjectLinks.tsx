import { useCallback, useState } from "react";
import type { ProjectLink, ProjectLinkInput } from "../api";
import { useAppData } from "../App";
import { ProjectLinkCard } from "./projectLinks/ProjectLinkCard.js";
import { BLANK_PROJECT_LINK, ProjectLinkForm } from "./projectLinks/ProjectLinkForm.js";

type Mode = "list" | "new" | { editing: ProjectLink };

export default function ProjectLinks(): JSX.Element {
  const {
    projectLinks,
    projectLinksLoading,
    cloudProjectLinkStore: cloudSync,
    usingDaemon,
    createProjectLink,
    updateProjectLink,
    deleteProjectLink,
  } = useAppData();

  const [mode, setMode] = useState<Mode>("list");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(
    async (data: ProjectLinkInput) => {
      setSaving(true);
      setError(null);
      try {
        if (typeof mode === "object" && "editing" in mode) {
          await updateProjectLink(mode.editing.id, data);
        } else {
          await createProjectLink(data);
        }
        setMode("list");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [mode, createProjectLink, updateProjectLink],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this Project Link?")) return;
      try {
        await deleteProjectLink(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [deleteProjectLink],
  );

  if (mode === "new" || (typeof mode === "object" && "editing" in mode)) {
    return (
      <div className={projectLinkFormShellClass()}>
        {error && (
          <div className="mb-4 rounded-lg border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-4 py-2 text-sm text-[rgb(var(--app-danger))]">
            {error}
          </div>
        )}
        <ProjectLinkForm
          initial={typeof mode === "object" ? mode.editing : BLANK_PROJECT_LINK}
          onSave={handleSave}
          onBack={() => setMode("list")}
          saving={saving}
          isNew={mode === "new"}
        />
      </div>
    );
  }

  return (
    <div className={projectLinksListShellClass()}>
      <div className={projectLinksHeaderClass()}>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-[rgb(var(--app-text))]">Project Links</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-[rgb(var(--app-text-muted))]">
              Each Project Link maps one local repo to Azure DevOps, branch defaults, and validation
              commands.
            </p>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <ProjectLinkStoragePill cloudSync={cloudSync} usingDaemon={usingDaemon} />
          </div>
        </div>
        {projectLinks.length > 0 && (
          <button
            onClick={() => setMode("new")}
            className="flex shrink-0 items-center gap-1.5 self-start rounded-md border border-[rgb(var(--app-border))] bg-transparent px-3 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))] sm:self-auto"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path
                d="M6 1v10M1 6h10"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
            New Project Link
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] px-4 py-2 text-sm text-[rgb(var(--app-danger))]">
          {error}
        </div>
      )}

      {projectLinksLoading && projectLinks.length === 0 ? (
        <ProjectLinksLoading />
      ) : projectLinks.length === 0 ? (
        <ProjectLinksEmpty onCreate={() => setMode("new")} />
      ) : (
        <div className={projectLinksGridClass()}>
          {projectLinks.map((projectLink) => (
            <ProjectLinkCard
              key={projectLink.id}
              projectLink={projectLink}
              onEdit={() => setMode({ editing: projectLink })}
              onDelete={() => void handleDelete(projectLink.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function projectLinkFormShellClass(): string {
  return "mx-auto w-full max-w-5xl";
}

export function projectLinksListShellClass(): string {
  return "mx-auto w-full max-w-7xl space-y-6";
}

export function projectLinksHeaderClass(): string {
  return "flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between";
}

export function projectLinksGridClass(): string {
  return "grid gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]";
}

function ProjectLinkStoragePill({
  cloudSync,
  usingDaemon,
}: {
  cloudSync: boolean;
  usingDaemon: boolean;
}): JSX.Element {
  if (cloudSync) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]">
        <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-success))]" />
        Cloud synced · Azure Table Storage
      </span>
    );
  }
  if (usingDaemon) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-text-muted))]">
        <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-text-subtle))]" />
        Local · daemon store
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-text-subtle))]">
      <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-text-faint))]" />
      Local · browser storage
    </span>
  );
}

export function ProjectLinksLoading(): JSX.Element {
  return (
    <section
      className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-5"
      aria-label="Loading Project Links"
    >
      <div className="flex max-w-xl items-center gap-3">
        <span className="h-9 w-9 animate-pulse rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[rgb(var(--app-text))]">
            Loading Project Links
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
            Checking saved repository mappings before showing the workspace.
          </p>
        </div>
      </div>
    </section>
  );
}

export function ProjectLinksEmpty({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <section className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-6">
      <div className="max-w-2xl">
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))] ring-1 ring-[rgb(var(--app-border))]">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M4.5 10h11M7.5 6.5h5M7.5 13.5h5M5 3.75h10A1.25 1.25 0 0 1 16.25 5v10A1.25 1.25 0 0 1 15 16.25H5A1.25 1.25 0 0 1 3.75 15V5A1.25 1.25 0 0 1 5 3.75Z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-[rgb(var(--app-text))]">
          Create a Project Link to start
        </h3>
        <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
          MergePilot needs one mapping between a local repository and Azure DevOps before it
          can review changes, inspect PRs, analyze pipelines, or run Git workflows.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex items-center justify-center rounded-md bg-[rgb(var(--app-accent))] px-3 py-2 text-sm font-medium text-white transition hover:bg-[rgb(var(--app-accent-strong))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
        >
          Create Project Link
        </button>
        <div className="mt-5">
          <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
            Setup needs
          </p>
          <ul className="mt-2 flex flex-wrap gap-2 text-xs text-[rgb(var(--app-text-muted))]">
            <li className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
              Local repository path
            </li>
            <li className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
              Default and PR branches
            </li>
            <li className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
              Azure DevOps mapping
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
