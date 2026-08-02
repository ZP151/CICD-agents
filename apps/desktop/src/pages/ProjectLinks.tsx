import { useCallback, useState } from "react";
import type { ProjectLink, ProjectLinkInput } from "../api";
import { useAppData } from "../App";
import {
  ActionButton,
  InlineNotice,
  StatusBadge,
  WorkbenchHeader,
  WorkbenchPage,
} from "../components/workbench/WorkbenchPrimitives.js";
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
      <WorkbenchPage className={projectLinkFormShellClass()}>
        {error && (
          <InlineNotice tone="danger" title="Project Link was not saved">{error}</InlineNotice>
        )}
        <ProjectLinkForm
          initial={typeof mode === "object" ? mode.editing : BLANK_PROJECT_LINK}
          onSave={handleSave}
          onBack={() => setMode("list")}
          saving={saving}
          isNew={mode === "new"}
        />
      </WorkbenchPage>
    );
  }

  return (
    <WorkbenchPage className={projectLinksListShellClass()}>
      <WorkbenchHeader
        title="Project Links"
        description="Map one local repository to Azure DevOps, branch defaults, and validation commands."
        actions={projectLinks.length > 0 && (
          <ActionButton
            onClick={() => setMode("new")}
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
          </ActionButton>
        )}
      >
        <ProjectLinkStoragePill cloudSync={cloudSync} usingDaemon={usingDaemon} />
      </WorkbenchHeader>

      {error && (
        <InlineNotice tone="danger" title="Project Link operation failed">{error}</InlineNotice>
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
    </WorkbenchPage>
  );
}

export function projectLinkFormShellClass(): string {
  return "max-w-5xl";
}

export function projectLinksListShellClass(): string {
  return "max-w-7xl gap-4";
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
      <StatusBadge tone="success">
        <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-success))]" />
        Cloud synced · Azure Table Storage
      </StatusBadge>
    );
  }
  if (usingDaemon) {
    return (
      <StatusBadge>
        <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-text-subtle))]" />
        Local · daemon store
      </StatusBadge>
    );
  }
  return (
    <StatusBadge>
      <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--app-text-faint))]" />
      Local · browser storage
    </StatusBadge>
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
        <ActionButton tone="primary" className="mt-4" onClick={onCreate}>Create Project Link</ActionButton>
        <div className="mt-5">
          <p className="text-xs font-medium text-[rgb(var(--app-text-subtle))]">
            Setup needs
          </p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[rgb(var(--app-text-muted))]">
            <li>Local repository path</li>
            <li>Default and PR branches</li>
            <li>Azure DevOps mapping</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
