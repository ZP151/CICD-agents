import { pipelineFilters } from "./pipelineModel.js";
import type { PipelineStatusFilter } from "./pipelineTypes.js";

interface PipelineStatusFiltersProps {
  filter: PipelineStatusFilter;
  counts: Record<PipelineStatusFilter, number>;
  onFilterChange: (filter: PipelineStatusFilter) => void;
}

export function PipelineStatusFilters({
  filter,
  counts,
  onFilterChange,
}: PipelineStatusFiltersProps): JSX.Element {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {pipelineFilters.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onFilterChange(item.key)}
          className={`rounded-lg border p-3 text-left transition ${
            filter === item.key
              ? "border-blue-900/60 bg-blue-950/20 text-blue-300"
              : "border-zinc-800/70 bg-zinc-900/20 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
          }`}
        >
          <p className="text-xs font-medium">{item.label}</p>
          <p className="mt-2 text-2xl font-semibold text-zinc-200">{counts[item.key]}</p>
        </button>
      ))}
    </section>
  );
}
