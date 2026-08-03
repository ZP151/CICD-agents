import { useEffect, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";

export interface ProjectLinkComboboxOption {
  id: string;
  name: string;
  orgUrl?: string;
  project?: string;
  repoName?: string;
}

export function filterProjectLinks(
  links: ProjectLinkComboboxOption[],
  query: string,
): ProjectLinkComboboxOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return links;
  return links.filter((link) =>
    [link.name, link.project, link.repoName, link.orgUrl]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  );
}

export function comboboxMoveHighlight(current: number, delta: number, count: number): number {
  if (count <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (current + delta + count) % count;
}

export function comboboxOptionLabel(option: ProjectLinkComboboxOption): string {
  const context = [option.project, option.repoName].filter(Boolean).join(" / ");
  return context ? `${option.name} · ${context}` : option.name;
}

/**
 * MP-012: accessible, searchable Project Link combobox on Radix Popover.
 * Keyboard (Arrow/Enter/Escape/Home/End), search, empty and loading states,
 * long-name truncation with full tooltip, and a clear action are all owned
 * here; the workbench never grows another select.
 */
export function ProjectLinkCombobox({
  options,
  value,
  onSelect,
  loading = false,
  error = null,
  onRetry,
  disabled = false,
  ariaLabel = "Project Link",
}: {
  options: ProjectLinkComboboxOption[];
  value: string | null;
  onSelect: (id: string | null) => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.id === value) ?? null;
  const filtered = useMemo(() => filterProjectLinks(options, query), [options, query]);
  const visible = filtered.length > 0 ? filtered : options;

  useEffect(() => {
    if (open) {
      setQuery("");
      setHighlight(0);
      // Defer so the Popover content is mounted before focus lands.
      const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const choose = (id: string) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="listbox"
          title={selected ? comboboxOptionLabel(selected) : undefined}
          className="min-w-0 max-w-full cursor-pointer rounded px-0.5 py-0.5 text-left text-[11px] text-[rgb(var(--app-text-muted))] transition hover:text-[rgb(var(--app-text))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[rgb(var(--app-text))] disabled:cursor-not-allowed"
        >
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate">
              {loading ? "Loading Project Link..." : selected ? selected.name : "No Project Link selected"}
            </span>
            <svg className="h-3 w-3 shrink-0 opacity-70" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-72 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-1.5 shadow-lg"
        >
          <div className="flex items-center gap-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] px-2">
            <svg className="h-3 w-3 shrink-0 text-[rgb(var(--app-text-subtle))]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setHighlight(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setHighlight((current) => comboboxMoveHighlight(current, 1, visible.length));
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setHighlight((current) => comboboxMoveHighlight(current, -1, visible.length));
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const option = visible[highlight];
                  if (option) choose(option.id);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  setHighlight(0);
                } else if (event.key === "End") {
                  event.preventDefault();
                  setHighlight(visible.length - 1);
                }
              }}
              placeholder="Search Project Links..."
              aria-label="Search Project Links"
              role="combobox"
              aria-expanded={open}
              aria-controls="project-link-options"
              className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-[rgb(var(--app-text))] placeholder:text-[rgb(var(--app-text-subtle))] focus:outline-none"
            />
          </div>

          {error ? (
            <div className="mt-1.5 rounded-md border border-[rgb(var(--app-danger))]/30 bg-[rgb(var(--app-danger)_/_0.08)] px-2.5 py-2 text-[11px] text-[rgb(var(--app-danger))]">
              <p>{error}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-1 font-medium text-[rgb(var(--app-accent-readable))] hover:underline"
                >
                  Retry
                </button>
              )}
            </div>
          ) : filtered.length === 0 ? (
            <div className="mt-1.5 px-2.5 py-2 text-[11px] text-[rgb(var(--app-text-muted))]">
              <p>No matching Project Links.</p>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setHighlight(0);
                }}
                className="mt-1 font-medium text-[rgb(var(--app-accent-readable))] hover:underline"
              >
                Clear search
              </button>
            </div>
          ) : (
            <ul id="project-link-options" role="listbox" aria-label="Project Links" className="mt-1.5 max-h-56 overflow-y-auto">
              {visible.map((option, index) => {
                const active = index === highlight;
                return (
                  <li key={option.id} role="option" aria-selected={option.id === value}>
                    <button
                      type="button"
                      title={comboboxOptionLabel(option)}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => choose(option.id)}
                      className={`flex w-full min-w-0 items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
                        active
                          ? "bg-[rgb(var(--app-accent)_/_0.12)] text-[rgb(var(--app-text))]"
                          : "text-[rgb(var(--app-text-muted))]"
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {option.name}
                        {(option.project || option.repoName) && (
                          <span className="block truncate text-[10px] text-[rgb(var(--app-text-subtle))]">
                            {[option.project, option.repoName].filter(Boolean).join(" / ")}
                          </span>
                        )}
                      </span>
                      {option.id === value && (
                        <svg className="h-3 w-3 shrink-0 text-[rgb(var(--app-accent-readable))]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                          <path d="m3 8.5 3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </li>
                );
              })}
              <li role="presentation">
                <button
                  type="button"
                  onClick={() => choose("")}
                  className="mt-0.5 w-full rounded px-2 py-1 text-left text-[11px] text-[rgb(var(--app-text-subtle))] hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]"
                >
                  No Project Link
                </button>
              </li>
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
