import type {
  ProjectLink,
  ProjectLinkInput,
} from "../../../api.js";
import { ProjectLinkAdoFields } from "./ProjectLinkAdoFields.js";
import { ProjectLinkBasicFields } from "./ProjectLinkBasicFields.js";
import { useProjectLinkSetupState } from "./useProjectLinkSetupState.js";

export function ProjectLinkSetupCard({
  repoPath,
  onCreated,
  createProjectLink,
  compact = false,
}: {
  repoPath: string;
  onCreated: (projectLink: ProjectLink) => void;
  createProjectLink: (data: ProjectLinkInput) => Promise<ProjectLink>;
  compact?: boolean;
}) {
  const state = useProjectLinkSetupState({ repoPath, onCreated, createProjectLink });

  return (
    <div
      className={`w-full max-w-full overflow-hidden bg-[rgb(var(--app-surface))] text-left ${
        compact
          ? "rounded-none border-0 p-0 shadow-none"
          : "rounded-xl border border-[rgb(var(--app-border))] p-5 shadow-xl"
      }`}
    >
      {!compact && <ProjectLinkSetupHeader />}

      <div className="grid gap-3">
        <ProjectLinkBasicFields
          branches={state.branches}
          branchError={state.branchError}
          branchLoading={state.branchLoading}
          form={state.form}
          loadBranches={state.loadBranches}
          setField={state.setField}
        />

        <button
          type="button"
          onClick={() => state.setAdvanced((value) => !value)}
          className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-[rgb(var(--app-border))] px-3 py-2 text-left text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))]"
        >
          <span className="flex items-center gap-2">
            <svg className={`h-3.5 w-3.5 transition ${state.advanced ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium">Azure DevOps</span>
          </span>
          {state.form.adoProject && state.form.adoRepoName && (
            <span className="shrink-0 rounded-full border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-subtle))]">configured</span>
          )}
        </button>

        {state.advanced && (
          <ProjectLinkAdoFields
            applyDiscovery={state.applyDiscovery}
            discovered={state.discovered}
            discovering={state.discovering}
            discoveryError={state.discoveryError}
            form={state.form}
            setDiscovered={state.setDiscovered}
            setDiscoveryError={state.setDiscoveryError}
            setField={state.setField}
            setForm={state.setForm}
          />
        )}

        {state.error && (
          <p className="rounded-lg border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] px-3 py-2 text-xs text-[rgb(var(--app-danger))]">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void state.save()}
            disabled={!state.canSave || state.saving}
            className="rounded-lg bg-[rgb(var(--app-accent))] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {state.saving ? "Creating..." : "Create and use"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectLinkSetupHeader() {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--app-surface-raised))]">
        <svg className="h-5 w-5 text-[rgb(var(--app-text-muted))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 7h7a5 5 0 010 10H6m10-5h5M3 12h8" />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[rgb(var(--app-text))]">Create a Project Link</p>
      </div>
    </div>
  );
}
