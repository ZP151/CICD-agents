import type { ProjectLinkInput } from "../../api.js";
import { ActionButton } from "../../components/workbench/WorkbenchPrimitives.js";
import { DEFAULT_ADO_ORG_URL, withoutProjectLinkFallbacks } from "../../projectLinks.js";
import { ProjectLinkAdoSection } from "./ProjectLinkAdoSection.js";
import { ProjectLinkWorkspaceSection } from "./ProjectLinkWorkspaceSection.js";
import { useProjectLinkFormRuntime } from "./useProjectLinkFormRuntime.js";

// V2 Project Links persist only the stable identity mapping. The legacy
// fields (branches, pipeline, MCP settings, template, commands) are read-only
// and are not part of the create/edit form.
export const BLANK_PROJECT_LINK = {
  name: "",
  repoPath: "",
  adoOrgUrl: DEFAULT_ADO_ORG_URL,
  adoProject: "",
  adoRepoName: "",
  adoPat: "",
} as ProjectLinkInput;

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
        <ActionButton
          type="button"
          onClick={onBack}
          tone="quiet"
          aria-label="Back to Project Links"
          title="Back to Project Links"
          className="h-7 min-h-7 w-7 px-0"
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
        </ActionButton>
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
            discoveryFailure={runtime.discoveryFailure}
            recovery={runtime.recovery}
            onRecoverOAuth={(kind) => void runtime.recoverOAuthAccess(kind)}
            onApplyDiscovery={runtime.applyDiscovery}
            onManualProjectChange={runtime.setManualProject}
            onManualRepositoryChange={runtime.setManualRepository}
          />
        </div>

        <div className={projectLinkFormActionsClass()}>
          <ActionButton
            type="submit"
            disabled={saving || !runtime.form.name.trim()}
            loading={saving}
            tone="primary"
            className="px-4 text-sm"
          >
            {saving ? "Saving..." : "Save Project Link"}
          </ActionButton>
          <ActionButton
            type="button"
            onClick={onBack}
            className="px-4 text-sm"
          >
            Cancel
          </ActionButton>
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
