import type { ProjectLink } from "../../api.js";

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
    <select
      className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-blue-400"
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
    </select>
  );
}
