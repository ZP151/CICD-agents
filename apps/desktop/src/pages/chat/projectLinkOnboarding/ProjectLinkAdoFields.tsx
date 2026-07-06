import type {
  AdoDiscoveryKind,
  AdoDiscoveryOption,
  ProjectLinkInput,
} from "../../../api.js";

export interface ProjectLinkAdoFieldsProps {
  applyDiscovery: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  discovered: Record<AdoDiscoveryKind, AdoDiscoveryOption[]>;
  discovering: AdoDiscoveryKind | null;
  discoveryError: string | null;
  form: ProjectLinkInput;
  setDiscovered: React.Dispatch<React.SetStateAction<Record<AdoDiscoveryKind, AdoDiscoveryOption[]>>>;
  setDiscoveryError: React.Dispatch<React.SetStateAction<string | null>>;
  setField: <K extends keyof ProjectLinkInput>(key: K) => (value: ProjectLinkInput[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<ProjectLinkInput>>;
  runDiscovery: (kind: AdoDiscoveryKind, mode?: "manual" | "auto") => Promise<void>;
}

export function ProjectLinkAdoFields({
  applyDiscovery,
  discovered,
  discovering,
  discoveryError,
  form,
  setDiscovered,
  setDiscoveryError,
  setField,
  setForm,
  runDiscovery,
}: ProjectLinkAdoFieldsProps) {
  return (
    <div className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
      <input
        aria-label="Azure DevOps organization URL"
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
        />
        <RepositorySelect
          applyDiscovery={applyDiscovery}
          discovered={discovered.repositories}
          discovering={discovering}
          form={form}
          setDiscovered={setDiscovered}
          setDiscoveryError={setDiscoveryError}
          setForm={setForm}
        />
      </div>
      <PipelineSelect
        applyDiscovery={applyDiscovery}
        discovered={discovered.pipelines}
        discovering={discovering}
        form={form}
        runDiscovery={runDiscovery}
        setDiscoveryError={setDiscoveryError}
        setForm={setForm}
      />
      {discoveryError && (
        <p className="rounded-md border border-red-900/40 bg-red-950/20 px-2.5 py-1.5 text-[11px] text-red-300">
          {discoveryError}
        </p>
      )}
    </div>
  );
}

interface PipelineSelectProps {
  applyDiscovery: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  discovered: AdoDiscoveryOption[];
  discovering: AdoDiscoveryKind | null;
  form: ProjectLinkInput;
  runDiscovery: (kind: AdoDiscoveryKind, mode?: "manual" | "auto") => Promise<void>;
  setDiscoveryError: React.Dispatch<React.SetStateAction<string | null>>;
  setForm: React.Dispatch<React.SetStateAction<ProjectLinkInput>>;
}

function PipelineSelect({
  applyDiscovery,
  discovered,
  discovering,
  form,
  runDiscovery,
  setDiscoveryError,
  setForm,
}: PipelineSelectProps) {
  if (discovered.length > 0) {
    return (
      <select
        aria-label="Azure Pipeline"
        className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
        value={discovered.some((option) => option.id === form.adoPipelineId) ? form.adoPipelineId : ""}
        onChange={(e) => {
          const selected = discovered.find((option) => option.id === e.target.value);
          if (selected) applyDiscovery("pipelines", selected);
        }}
      >
        <option value="">{discovering === "pipelines" ? "Discovering pipelines..." : "Select pipeline"}</option>
        {discovered.map((option) => (
          <option key={option.id} value={option.id}>{option.name}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
      <input
        aria-label="Azure Pipeline name"
        className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
        value={form.adoPipelineName}
        onChange={(e) => {
          const value = e.target.value;
          setDiscoveryError(null);
          setForm((current) => ({
            ...current,
            adoPipelineId: current.adoPipelineName === value ? current.adoPipelineId : "",
            adoPipelineName: value,
          }));
        }}
        placeholder={discovering === "pipelines" ? "Discovering pipelines..." : "Pipeline name"}
      />
      <button
        type="button"
        onClick={() => void runDiscovery("pipelines")}
        disabled={discovering === "pipelines" || !form.adoOrgUrl.trim() || !form.adoProject.trim()}
        className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {discovering === "pipelines" ? "Loading..." : "Find"}
      </button>
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
}

function ProjectSelect({
  applyDiscovery,
  discovered,
  discovering,
  form,
  setDiscovered,
  setDiscoveryError,
  setForm,
}: ProjectSelectProps) {
  if (discovered.length > 0) {
    return (
      <select
        aria-label="Azure DevOps project"
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
      aria-label="Azure DevOps project"
      className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
      value={form.adoProject}
      onChange={(e) => {
        const value = e.target.value;
        setDiscoveryError(null);
        setDiscovered((current) => ({ ...current, repositories: [], pipelines: [] }));
        setForm((current) => ({
          ...current,
          adoProject: value,
          adoRepoName: current.adoProject === value ? current.adoRepoName : "",
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
}

function RepositorySelect({
  applyDiscovery,
  discovered,
  discovering,
  form,
  setDiscovered,
  setDiscoveryError,
  setForm,
}: RepositorySelectProps) {
  if (discovered.length > 0) {
    return (
      <select
        aria-label="Azure DevOps repository"
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
      aria-label="Azure DevOps repository"
      className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
      value={form.adoRepoName}
      onChange={(e) => {
        const value = e.target.value;
        setDiscoveryError(null);
        setDiscovered((current) => ({ ...current, pipelines: [] }));
        setForm((current) => ({
          ...current,
          adoRepoName: value,
        }));
      }}
      placeholder={discovering === "repositories" ? "Discovering repositories..." : "ADO repo"}
    />
  );
}
