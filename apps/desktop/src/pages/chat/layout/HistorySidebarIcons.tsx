import type { ReactNode } from "react";

export function PinIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg className="h-3.5 w-3.5" fill={filled ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.5 4.5l5 5-3.2 1.1-3.4 3.4.7 4.2-1.4 1.4-3.5-3.5-4.2 4.2-1-1 4.2-4.2-3.5-3.5 1.4-1.4 4.2.7 3.4-3.4 1.3-3.4z" />
    </svg>
  );
}

export function UnpinIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M14.5 4.5l5 5-3.2 1.1-3.4 3.4.7 4.2-1.4 1.4-3.5-3.5-4.2 4.2-1-1 4.2-4.2-3.5-3.5 1.4-1.4 4.2.7 3.4-3.4 1.3-3.4z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 4l16 16" />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12h.01M12 12h.01M18 12h.01" />
    </svg>
  );
}

export function InlineTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-muted))] shadow-xl group-hover/tooltip:block group-focus-within/tooltip:block">
        {label}
      </span>
    </span>
  );
}
