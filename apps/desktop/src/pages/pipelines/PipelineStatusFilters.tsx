import { pipelineFilters } from "./pipelineModel.js";
import type { PipelineStatusFilter } from "./pipelineTypes.js";
import { WorkbenchFilterTabs } from "../../components/workbench/WorkbenchPrimitives.js";

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
    <WorkbenchFilterTabs
      ariaLabel="Pipeline status filters"
      className={pipelineStatusFiltersGridClass()}
      options={pipelineFilters.map((item) => ({
        value: item.key,
        label: item.label,
        count: counts[item.key],
      }))}
      value={filter}
      onValueChange={onFilterChange}
    />
  );
}

export function pipelineStatusFiltersGridClass(): string {
  return "flex min-w-0 flex-wrap items-center gap-1.5";
}
