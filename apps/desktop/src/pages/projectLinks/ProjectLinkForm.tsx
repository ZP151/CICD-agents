import type { ProjectLinkInput } from "../../api.js";
import { DEFAULT_ADO_ORG_URL, withoutProjectLinkFallbacks } from "../../projectLinks.js";
import { ProjectLinkAdoSection } from "./ProjectLinkAdoSection.js";
import { ProjectLinkWorkspaceSection } from "./ProjectLinkWorkspaceSection.js";
import { useProjectLinkFormRuntime } from "./useProjectLinkFormRuntime.js";

export const BLANK_PROJECT_LINK: ProjectLinkInput = {
  name: "",
  repoPath: "",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: DEFAULT_ADO_ORG_URL,
  adoProject: "",
  adoRepoName: "",
  adoPipelineId: "",
  adoPipelineName: "",
  adoPat: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "repositories,pipelines,work-items",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
};

export function ProjectLinkForm({
  initial,
  onSave,
  onBack,
  saving,
  isNew,
}: {
  initial: ProjectLinkInput;
  onSave: (data: ProjectLinkInput) => Promise<void>;
  onBack: () => void;
  saving: boolean;
  isNew: boolean;
}): JSX.Element {
  const runtime = useProjectLinkFormRuntime(initial);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M10 3L5 8l5 5"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.6"
            />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-[rgb(var(--app-text))]">
          {isNew ? "New Project Link" : "Edit Project Link"}
        </h2>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(withoutProjectLinkFallbacks(runtime.form));
        }}
        className="space-y-5"
      >
        <div className={projectLinkFormSectionsClass()}>
          <ProjectLinkWorkspaceSection
            form={runtime.form}
            set={runtime.set}
            branches={runtime.branches}
            branchLoading={runtime.branchLoading}
            branchError={runtime.branchError}
            repoInputClass={runtime.repoInputClass}
            onReloadBranches={(repoPath) => void runtime.loadBranches(repoPath)}
          />

          <ProjectLinkAdoSection
            form={runtime.form}
            set={runtime.set}
            discovered={runtime.discovered}
            discovering={runtime.discovering}
            discoveryError={runtime.discoveryError}
            onApplyDiscovery={runtime.applyDiscovery}
            onManualProjectChange={runtime.setManualProject}
            onManualRepositoryChange={runtime.setManualRepository}
            onManualPipelineChange={runtime.setManualPipeline}
          />
        </div>

        <div className={projectLinkFormActionsClass()}>
          <button
            type="submit"
            disabled={saving || !runtime.form.name.trim()}
            className="rounded-lg bg-[rgb(var(--app-accent))] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Project Link"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-[rgb(var(--app-border))] px-5 py-2 text-sm text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function projectLinkFormActionsClass(): string {
  return "flex flex-wrap items-center gap-3 pb-4";
}

export function projectLinkFormSectionsClass(): string {
  return "grid min-w-0 gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]";
}
