import type { AdoDiscoveryKind, AdoDiscoveryOption, ProjectLinkInput } from "../../api.js";
import { Field } from "./ProjectLinkFormControls.js";

export function PipelineDetails({
  form,
  discovered,
  discovering,
  pipelineHint,
  onApply,
  onDiscover,
  onFieldChange,
}: {
  form: ProjectLinkInput;
  discovered: AdoDiscoveryOption[];
  discovering: AdoDiscoveryKind | null;
  pipelineHint: string | null;
  onApply: (kind: AdoDiscoveryKind, option: AdoDiscoveryOption) => void;
  onDiscover: () => void;
  onFieldChange: <K extends keyof ProjectLinkInput>(
    key: K,
  ) => (value: ProjectLinkInput[K]) => void;
}): JSX.Element {
  return (
    <details className="group rounded-lg border border-zinc-800 bg-zinc-950/30">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-zinc-500 transition hover:text-zinc-300">
        <span className="flex min-w-0 items-center gap-2">
          <svg
            className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="font-medium">Pipeline</span>
        </span>
        {(form.adoPipelineName || form.adoPipelineId) && (
          <span className="shrink-0 rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
            configured
          </span>
        )}
      </summary>
      <div className="space-y-3 border-t border-zinc-800 px-3 py-3">
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/30 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-zinc-400">Pipeline matching</p>
            </div>
            <button
              type="button"
              onClick={onDiscover}
              disabled={
                !form.adoOrgUrl || !form.adoProject || !form.adoRepoName || discovering !== null
              }
              className="rounded-md border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200 disabled:opacity-40"
            >
              {discovering === "pipelines" ? "Discovering..." : "Refresh pipelines"}
            </button>
          </div>
          {discovered.length > 0 && (
            <label className="grid gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                pipelines
              </span>
              <select
                className="rounded-md border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-300 outline-none focus:border-zinc-600"
                defaultValue=""
                onChange={(event) => {
                  const selected = discovered.find((option) => option.id === event.target.value);
                  if (selected) onApply("pipelines", selected);
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Pipeline ID"
              value={form.adoPipelineId}
              onChange={onFieldChange("adoPipelineId")}
              placeholder="123"
            />
            <Field
              label="Pipeline name"
              value={form.adoPipelineName}
              onChange={onFieldChange("adoPipelineName")}
              placeholder="CI"
            />
          </div>
        </div>
      </div>
    </details>
  );
}
