import type {
  AdoDiscoveryKind,
  AdoDiscoveryOption,
  ProjectLinkInput,
} from "../../../api.js";

interface PipelineFieldsProps {
  applyDiscovery: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  discovered: AdoDiscoveryOption[];
  discovering: AdoDiscoveryKind | null;
  form: ProjectLinkInput;
  pipelineHint: string | null;
  runDiscovery: (kind: AdoDiscoveryKind, mode?: "manual" | "auto") => Promise<void>;
  setField: <K extends keyof ProjectLinkInput>(key: K) => (value: ProjectLinkInput[K]) => void;
}

export function ProjectLinkPipelineFields({
  applyDiscovery,
  discovered,
  discovering,
  form,
  pipelineHint,
  runDiscovery,
  setField,
}: PipelineFieldsProps) {
  return (
    <div className="grid gap-3 border-t border-[rgb(var(--app-border))] p-3">
      <div className="grid gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <span className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">
            Pipeline matching
          </span>
          <button
            type="button"
            onClick={() => void runDiscovery("pipelines")}
            disabled={
              !form.adoOrgUrl || !form.adoProject || !form.adoRepoName || discovering !== null
            }
            className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-muted))] transition hover:border-zinc-500 hover:text-[rgb(var(--app-text))] disabled:opacity-40"
          >
            {discovering === "pipelines" ? "Discovering..." : "Refresh pipelines"}
          </button>
        </div>
        {discovered.length > 0 && (
          <label className="grid gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
              pipelines
            </span>
            <select
              className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
              defaultValue=""
              onChange={(event) => {
                const selected = discovered.find((option) => option.id === event.target.value);
                if (selected) applyDiscovery("pipelines", selected);
              }}
            >
              <option value="">Select pipeline</option>
              {discovered.map((option) => (
                <option key={`pipelines-${option.id}`} value={option.id}>
                  {option.name}
                  {option.description ? ` - ${option.description}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}
        {pipelineHint && (
          <p className="rounded-md border border-emerald-900/40 bg-emerald-950/20 px-2.5 py-1.5 text-[11px] text-emerald-300">
            {pipelineHint}
          </p>
        )}
        <div className="grid min-w-0 grid-cols-1 gap-2">
          <input
            className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
            value={form.adoPipelineId}
            onChange={(e) => setField("adoPipelineId")(e.target.value)}
            placeholder="Pipeline ID"
          />
          <input
            className="w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-1.5 text-xs text-[rgb(var(--app-text))] outline-none focus:border-zinc-500"
            value={form.adoPipelineName}
            onChange={(e) => setField("adoPipelineName")(e.target.value)}
            placeholder="Pipeline name"
          />
        </div>
      </div>
    </div>
  );
}
