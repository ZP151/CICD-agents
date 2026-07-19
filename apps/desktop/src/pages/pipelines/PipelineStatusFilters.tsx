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
    <section className={pipelineStatusFiltersGridClass()}>
      {pipelineFilters.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onFilterChange(item.key)}
          className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-left text-xs transition ${
            filter === item.key
              ? "border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text))] ring-1 ring-[rgb(var(--app-border))]"
              : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]"
          }`}
        >
          <span className="font-medium">{item.label}</span>
          <span className="font-semibold text-[rgb(var(--app-text))]">{counts[item.key]}</span>
        </button>
      ))}
    </section>
  );
}

export function pipelineStatusFiltersGridClass(): string {
  return "flex min-w-0 flex-wrap gap-1.5";
}
