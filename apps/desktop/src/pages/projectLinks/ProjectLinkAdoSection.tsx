import type { AdoDiscoveryKind, AdoDiscoveryOption, ProjectLinkInput } from "../../api.js";
import { Field, ProjectDiscoveryField } from "./ProjectLinkFormControls.js";

interface ProjectLinkAdoSectionProps {
  form: ProjectLinkInput;
  set: <K extends keyof ProjectLinkInput>(key: K) => (value: ProjectLinkInput[K]) => void;
  discovered: Record<AdoDiscoveryKind, AdoDiscoveryOption[]>;
  discovering: AdoDiscoveryKind | null;
  discoveryError: string | null;
  onApplyDiscovery: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  onManualProjectChange: (value: string) => void;
  onManualRepositoryChange: (value: string) => void;
  onManualPipelineChange: (value: string) => void;
}

export function ProjectLinkAdoSection({
  form,
  set,
  discovered,
  discovering,
  discoveryError,
  onApplyDiscovery,
  onManualProjectChange,
  onManualRepositoryChange,
  onManualPipelineChange,
}: ProjectLinkAdoSectionProps): JSX.Element {
  return (
    <section className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-200">Azure DevOps</h3>
      </div>
      <Field
        label="Organisation URL"
        value={form.adoOrgUrl}
        onChange={set("adoOrgUrl")}
        placeholder="https://dev.azure.com/myorg"
      />
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <ProjectDiscoveryField
          kind="projects"
          label="Project"
          options={discovered.projects}
          value={form.adoProject}
          discovering={discovering}
          placeholder="MyProject"
          onApply={onApplyDiscovery}
          onManualChange={onManualProjectChange}
        />
        <ProjectDiscoveryField
          kind="repositories"
          label="Repository name"
          options={discovered.repositories}
          value={form.adoRepoName}
          discovering={discovering}
          placeholder="my-repo"
          onApply={onApplyDiscovery}
          onManualChange={onManualRepositoryChange}
        />
      </div>
      <ProjectDiscoveryField
        kind="pipelines"
        label="Pipeline"
        options={discovered.pipelines}
        value={form.adoPipelineName}
        discovering={discovering}
        placeholder="CI pipeline"
        onApply={onApplyDiscovery}
        onManualChange={onManualPipelineChange}
      />
      {discoveryError && (
        <p className="rounded-md border border-red-900/40 bg-red-950/20 px-2.5 py-1.5 text-[11px] text-red-300">
          {discoveryError}
        </p>
      )}
    </section>
  );
}
