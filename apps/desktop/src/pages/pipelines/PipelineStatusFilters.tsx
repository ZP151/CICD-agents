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
    <section className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {pipelineFilters.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onFilterChange(item.key)}
          className={`rounded-md border px-3 py-2 text-left transition ${
            filter === item.key
              ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))]"
              : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          }`}
        >
          <p className="text-[11px] font-medium">{item.label}</p>
          <p className="mt-1 text-lg font-semibold text-[rgb(var(--app-text))]">{counts[item.key]}</p>
        </button>
      ))}
    </section>
  );
}
