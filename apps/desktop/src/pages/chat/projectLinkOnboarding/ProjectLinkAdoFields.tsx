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
}: ProjectLinkAdoFieldsProps) {
  return (
    <div className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-3">
      <input
        aria-label="Azure DevOps organization URL"
        className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-[rgb(var(--app-accent))]"
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
      {discoveryError && (
        <p className="rounded-md border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.10)] px-2.5 py-1.5 text-[11px] text-[rgb(var(--app-danger))]">
          {discoveryError}
        </p>
      )}
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
        className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-[rgb(var(--app-accent))]"
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
      className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-[rgb(var(--app-accent))]"
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
        className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-[rgb(var(--app-accent))]"
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
      className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-[rgb(var(--app-accent))]"
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
