export function ChevronIcon({ open, compact = false }: { open: boolean; compact?: boolean }) {
  const size = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 inline-flex ${size} shrink-0 items-center justify-center text-[rgb(var(--app-text-subtle))] transition-transform duration-150 ${open ? "rotate-180" : "rotate-0"}`}
    >
      <span className="h-1.5 w-1.5 rotate-45 border-b border-r border-current" />
    </span>
  );
}
