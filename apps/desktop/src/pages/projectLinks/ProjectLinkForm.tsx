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
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
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
        <h2 className="text-xl font-semibold text-zinc-100">
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
        />

        <div className="flex items-center gap-3 pb-4">
          <button
            type="submit"
            disabled={saving || !runtime.form.name.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Project Link"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
