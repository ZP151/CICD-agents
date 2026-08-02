import type { ProjectLink } from "../../api.js";
import { WorkbenchSelect } from "../../components/workbench/WorkbenchPrimitives.js";

interface ProjectLinkFilterProps {
  projectLinks: ProjectLink[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export function ProjectLinkFilter({
  projectLinks,
  value,
  onChange,
  label,
}: ProjectLinkFilterProps): JSX.Element {
  return (
    <WorkbenchSelect
      className="min-h-8 px-2 py-1 text-xs text-[rgb(var(--app-text-muted))]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      <option value="all">All Project Links</option>
      {projectLinks.map((projectLink) => (
        <option key={projectLink.id} value={projectLink.id}>
          {projectLink.name}
        </option>
      ))}
    </WorkbenchSelect>
  );
}
