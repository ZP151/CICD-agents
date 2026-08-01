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
    <section className="space-y-3.5 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[rgb(var(--app-text))]">Azure DevOps</h3>
      </div>
      <Field
        label="Organisation URL"
        value={form.adoOrgUrl}
        onChange={set("adoOrgUrl")}
        placeholder="https://dev.azure.com/myorg"
      />
      <div className={projectLinkAdoProjectRepoGridClass()}>
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
      <fieldset className="space-y-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2.5">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[rgb(var(--app-text))]">
          <input
            type="checkbox"
            checked={form.adoMcpEnabled}
            onChange={(event) => set("adoMcpEnabled")(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-[rgb(var(--app-border-strong))] text-[rgb(var(--app-accent))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--app-accent))]"
          />
          <span>
            <span className="block font-medium">Use managed Azure DevOps MCP</span>
            <span className="mt-0.5 block text-xs leading-5 text-[rgb(var(--app-text-muted))]">
              This Project Link selects a connector configured locally. Commands and credentials stay in local config and are never saved here.
            </span>
          </span>
        </label>
        {form.adoMcpEnabled && (
          <div className="pl-6">
            <Field
              label="Allowed MCP domains"
              value={form.adoMcpDomains}
              onChange={set("adoMcpDomains")}
              placeholder="repositories,pipelines,work-items"
            />
            <p className="mt-1.5 text-[11px] leading-4 text-[rgb(var(--app-text-subtle))]">
              Choose from repositories, pipelines, work-items, and pull-requests. Remote write tools still require approval.
            </p>
          </div>
        )}
      </fieldset>
      {discoveryError && (
        <p className="rounded-md border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] px-2.5 py-1.5 text-[11px] text-[rgb(var(--app-danger))]">
          {discoveryError}
        </p>
      )}
    </section>
  );
}

export function projectLinkAdoProjectRepoGridClass(): string {
  return "grid min-w-0 gap-3 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]";
}
