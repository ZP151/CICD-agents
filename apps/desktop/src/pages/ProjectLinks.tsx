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
      <div className="mx-auto w-full max-w-xl">
        {error && (
          <div className="mb-4 rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-400">
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
    <div className="mx-auto w-full max-w-xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-100">Project Links</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm text-zinc-500">
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
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 bg-transparent px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800/40 hover:text-zinc-200"
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
        <div className="rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      {projectLinksLoading && projectLinks.length === 0 ? (
        <ProjectLinksLoading />
      ) : projectLinks.length === 0 ? (
        <ProjectLinksEmpty onCreate={() => setMode("new")} />
      ) : (
        <div className="space-y-2">
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

function ProjectLinkStoragePill({
  cloudSync,
  usingDaemon,
}: {
  cloudSync: boolean;
  usingDaemon: boolean;
}): JSX.Element {
  if (cloudSync) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800/40 bg-emerald-900/30 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Cloud synced · Azure Table Storage
      </span>
    );
  }
  if (usingDaemon) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
        Local · daemon store
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/60 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
      Local · browser storage
    </span>
  );
}

function ProjectLinksLoading(): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
      <p className="text-xs text-zinc-600">Loading Project Links...</p>
    </div>
  );
}

function ProjectLinksEmpty({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="text-zinc-700">
        <rect x="6" y="8" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M13 16h14M13 21h10"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.5"
        />
      </svg>
      <p className="text-sm text-zinc-500">No Project Links yet.</p>
      <button onClick={onCreate} className="text-sm text-blue-400 transition hover:text-blue-300">
        Create your first Project Link
      </button>
    </div>
  );
}
