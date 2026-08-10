import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectLink } from "../../../api.js";
import { WorkbenchTextInput } from "../../../components/workbench/WorkbenchPrimitives.js";
import { isTemporaryProjectLink } from "../../../projectLinks.js";

export function filterProjectLinks(projectLinks: ProjectLink[], query: string): ProjectLink[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return projectLinks;
  return projectLinks.filter((projectLink) => projectLink.name.toLocaleLowerCase().includes(normalizedQuery));
}

/**
 * Context pickers are for durable workspace configuration. Acceptance and
 * probe links remain available only as a last resort, so a fresh test run
 * cannot turn an everyday selection list into an unbounded log of fixtures.
 */
export function selectableProjectLinks(projectLinks: ProjectLink[]): ProjectLink[] {
  const saved = projectLinks.filter((projectLink) => !isTemporaryProjectLink(projectLink));
  return saved.length > 0 ? saved : projectLinks;
}

export function ProjectLinkPicker({
  projectLinks,
  value,
  onChange,
  allowEmpty = true,
  disabled = false,
}: {
  projectLinks: ProjectLink[];
  value: string | null;
  onChange: (id: string) => void;
  allowEmpty?: boolean;
  disabled?: boolean;
}): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeProjectLink = projectLinks.find((projectLink) => projectLink.id === value) ?? null;
  const options = useMemo(() => selectableProjectLinks(projectLinks), [projectLinks]);
  const showingTemporaryFallback = options.length > 0 && options.every(isTemporaryProjectLink);
  const matches = useMemo(() => filterProjectLinks(options, query), [options, query]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [open]);

  const selectProjectLink = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        aria-label="Workspace Project Link"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={activeProjectLink?.name ?? "No Project Link"}
        className="flex min-h-8 max-[900px]:min-h-9 w-full min-w-0 items-center gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] px-2 py-1 text-left text-sm text-[rgb(var(--app-text))] transition-[background-color,border-color,box-shadow] duration-[var(--app-motion-fast)] hover:border-[rgb(var(--app-border-strong))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-focus))]/35 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 flex-1 truncate">{activeProjectLink?.name ?? "No Project Link"}</span>
        <svg className={`h-3.5 w-3.5 shrink-0 text-[rgb(var(--app-text-subtle))] transition-transform duration-[var(--app-motion-fast)] ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface))] p-1.5 shadow-[0_6px_14px_rgb(var(--app-overlay)_/_0.18)]">
          <WorkbenchTextInput
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && matches.length === 1) selectProjectLink(matches[0]!.id);
            }}
            placeholder="Search Project Links"
            aria-label="Search Project Links"
            className="mb-1.5 min-h-9 px-2 py-1"
          />
          <div role="listbox" aria-label="Project Links" className="max-h-56 overflow-y-auto overscroll-contain">
            {allowEmpty && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => selectProjectLink("")}
                className={`flex min-h-8 max-[900px]:min-h-9 w-full items-center rounded px-2 py-1 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/35 ${
                  !value
                    ? "bg-[rgb(var(--app-accent))] text-white"
                    : "text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-control-hover))] hover:text-[rgb(var(--app-text))]"
                }`}
              >
                <span className="truncate">No Project Link</span>
              </button>
            )}
            {matches.map((projectLink) => {
              const selected = projectLink.id === value;
              return (
                <button
                  key={projectLink.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => selectProjectLink(projectLink.id)}
                  title={projectLink.name}
                  className={`flex min-h-8 max-[900px]:min-h-9 w-full items-center rounded px-2 py-1 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/35 ${
                    selected
                      ? "bg-[rgb(var(--app-accent))] text-white"
                      : "text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-control-hover))] hover:text-[rgb(var(--app-text))]"
                  }`}
                >
                  <span className="truncate">{projectLink.name}</span>
                </button>
              );
            })}
            {matches.length === 0 && (
              <p className="px-2 py-2 text-xs text-[rgb(var(--app-text-subtle))]">No matching Project Links.</p>
            )}
          </div>
          <p className="px-2 pb-0.5 pt-1.5 text-[10px] text-[rgb(var(--app-text-subtle))]">
            {matches.length} of {options.length} {showingTemporaryFallback ? "temporary" : "saved"} Project Links
          </p>
        </div>
      )}
    </div>
  );
}
