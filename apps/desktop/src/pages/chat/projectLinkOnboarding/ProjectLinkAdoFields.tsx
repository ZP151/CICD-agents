import type {
  AdoDiscoveryKind,
  AdoDiscoveryOption,
  ProjectLinkInput,
} from "../../../api.js";
import { ProjectLinkPipelineFields } from "./ProjectLinkPipelineFields.js";

export interface ProjectLinkAdoFieldsProps {
  applyDiscovery: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  discovered: Record<AdoDiscoveryKind, AdoDiscoveryOption[]>;
  discovering: AdoDiscoveryKind | null;
  discoveryError: string | null;
  form: ProjectLinkInput;
  pipelineHint: string | null;
  runDiscovery: (kind: AdoDiscoveryKind, mode?: "manual" | "auto") => Promise<void>;
  setDiscovered: React.Dispatch<React.SetStateAction<Record<AdoDiscoveryKind, AdoDiscoveryOption[]>>>;
  setDiscoveryError: React.Dispatch<React.SetStateAction<string | null>>;
  setField: <K extends keyof ProjectLinkInput>(key: K) => (value: ProjectLinkInput[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<ProjectLinkInput>>;
  setPipelineHint: React.Dispatch<React.SetStateAction<string | null>>;
}

export function ProjectLinkAdoFields({
  applyDiscovery,
  discovered,
  discovering,
  discoveryError,
  form,
  pipelineHint,
  runDiscovery,
  setDiscovered,
  setDiscoveryError,
  setField,
  setForm,
  setPipelineHint,
}: ProjectLinkAdoFieldsProps) {
  const hasPipelineConfigured = Boolean(form.adoPipelineName || form.adoPipelineId);

  return (
    <div className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
      <input
        className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
        value={form.adoOrgUrl}
        onChange={(e) => {
          setDiscoveryError(null);
          setField("adoOrgUrl")(e.target.value);
        }}
        placeholder="https://dev.azure.com/org"
      />
      <div className="grid min-w-0 grid-cols-1 gap-2">
        <ProjectSelect
          applyDiscovery={applyDiscovery}
          discovered={discovered.projects}
          discovering={discovering}
          form={form}
          setDiscovered={setDiscovered}
          setDiscoveryError={setDiscoveryError}
          setForm={setForm}
          setPipelineHint={setPipelineHint}
        />
        <RepositorySelect
          applyDiscovery={applyDiscovery}
          discovered={discovered.repositories}
          discovering={discovering}
          form={form}
          setDiscovered={setDiscovered}
          setDiscoveryError={setDiscoveryError}
          setForm={setForm}
          setPipelineHint={setPipelineHint}
        />
      </div>
      {discoveryError && (
        <p className="rounded-md border border-red-900/40 bg-red-950/20 px-2.5 py-1.5 text-[11px] text-red-300">
          {discoveryError}
        </p>
      )}

      <details className="group rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))]">
          <span className="flex items-center gap-2">
            <svg className="h-3.5 w-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium">Pipeline</span>
          </span>
          {hasPipelineConfigured && (
            <span className="shrink-0 rounded-full border border-[rgb(var(--app-border))] px-2 py-0.5 text-[10px] text-[rgb(var(--app-text-subtle))]">configured</span>
          )}
        </summary>
        <ProjectLinkPipelineFields
          applyDiscovery={applyDiscovery}
          discovered={discovered.pipelines}
          discovering={discovering}
          form={form}
          pipelineHint={pipelineHint}
          runDiscovery={runDiscovery}
          setField={setField}
        />
      </details>
    </div>
  );
}

interface ProjectSelectProps {
  applyDiscovery: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  discovered: AdoDiscoveryOption[];
  discovering: AdoDiscoveryKind | null;
  form: ProjectLinkInput;
  setDiscovered: React.Dispatch<React.SetStateAction<Record<AdoDiscoveryKind, AdoDiscoveryOption[]>>>;
  setDiscoveryError: React.Dispatch<React.SetStateAction<string | null>>;
  setForm: React.Dispatch<React.SetStateAction<ProjectLinkInput>>;
  setPipelineHint: React.Dispatch<React.SetStateAction<string | null>>;
}

function ProjectSelect({
  applyDiscovery,
  discovered,
  discovering,
  form,
  setDiscovered,
  setDiscoveryError,
  setForm,
  setPipelineHint,
}: ProjectSelectProps) {
  if (discovered.length > 0) {
    return (
      <select
        className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
        value={discovered.some((option) => option.name === form.adoProject) ? form.adoProject : ""}
        onChange={(e) => {
          const selected = discovered.find((option) => option.name === e.target.value);
          if (selected) applyDiscovery("projects", selected);
        }}
      >
        <option value="">{discovering === "projects" ? "Discovering projects..." : "Select project"}</option>
        {discovered.map((option) => (
          <option key={option.id} value={option.name}>{option.name}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
      value={form.adoProject}
      onChange={(e) => {
        const value = e.target.value;
        setDiscoveryError(null);
        setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
        setPipelineHint(null);
        setForm((current) => ({
          ...current,
          adoProject: value,
          adoRepoName: current.adoProject === value ? current.adoRepoName : "",
          adoPipelineId: current.adoProject === value ? current.adoPipelineId : "",
          adoPipelineName: current.adoProject === value ? current.adoPipelineName : "",
        }));
      }}
      placeholder={discovering === "projects" ? "Discovering projects..." : "ADO project"}
    />
  );
}

interface RepositorySelectProps {
  applyDiscovery: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  discovered: AdoDiscoveryOption[];
  discovering: AdoDiscoveryKind | null;
  form: ProjectLinkInput;
  setDiscovered: React.Dispatch<React.SetStateAction<Record<AdoDiscoveryKind, AdoDiscoveryOption[]>>>;
  setDiscoveryError: React.Dispatch<React.SetStateAction<string | null>>;
  setForm: React.Dispatch<React.SetStateAction<ProjectLinkInput>>;
  setPipelineHint: React.Dispatch<React.SetStateAction<string | null>>;
}

function RepositorySelect({
  applyDiscovery,
  discovered,
  discovering,
  form,
  setDiscovered,
  setDiscoveryError,
  setForm,
  setPipelineHint,
}: RepositorySelectProps) {
  if (discovered.length > 0) {
    return (
      <select
        className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
        value={discovered.some((option) => option.name === form.adoRepoName) ? form.adoRepoName : ""}
        onChange={(e) => {
          const selected = discovered.find((option) => option.name === e.target.value);
          if (selected) applyDiscovery("repositories", selected);
        }}
      >
        <option value="">{discovering === "repositories" ? "Discovering repositories..." : "Select repository"}</option>
        {discovered.map((option) => (
          <option key={option.id} value={option.name}>{option.name}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
      value={form.adoRepoName}
      onChange={(e) => {
        const value = e.target.value;
        setDiscoveryError(null);
        setDiscovered((current) => ({ ...current, pipelines: [] }));
        setPipelineHint(null);
        setForm((current) => ({
          ...current,
          adoRepoName: value,
          adoPipelineId: current.adoRepoName === value ? current.adoPipelineId : "",
          adoPipelineName: current.adoRepoName === value ? current.adoPipelineName : "",
        }));
      }}
      placeholder={discovering === "repositories" ? "Discovering repositories..." : "ADO repo"}
    />
  );
}
