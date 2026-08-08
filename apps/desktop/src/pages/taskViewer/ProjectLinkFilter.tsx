import type { ProjectLink } from "../../api.js";

interface ProjectLinkFilterProps {
  projectLinks: ProjectLink[];
  value: string;
  label: string;
}

/**
 * Read-only display of the current Project Link filter. Context is the only
 * place Project Links are selected; activity lists reflect the active link
 * instead of offering a second switching surface.
 */
export function ProjectLinkFilter({
  projectLinks,
  value,
  label,
}: ProjectLinkFilterProps): JSX.Element {
  const activeLink = projectLinks.find((projectLink) => projectLink.id === value) ?? null;
  const display = activeLink?.name ?? "All Project Links";
  return (
    <span
      className="min-h-8 px-2 py-1 text-xs text-[rgb(var(--app-text-muted))]"
      title={label}
      aria-label={label}
    >
      {display}
    </span>
  );
}
