import type { PropsWithChildren, ReactNode } from "react";

/**
 * Read-only facts deliberately use a definition list instead of a field-card
 * grid. Activity records are evidence, not editable widgets; removing their
 * repeated containers makes the selected operation much easier to scan.
 */
export function ActivityFactGrid({
  children,
  className = "",
}: PropsWithChildren<{ className?: string }>): JSX.Element {
  return (
    <dl className={`grid min-w-0 gap-x-5 gap-y-3 ${className}`.trim()}>{children}</dl>
  );
}

export function ActivityFact({
  label,
  children,
  mono = false,
  className = "",
}: PropsWithChildren<{
  label: string;
  mono?: boolean;
  className?: string;
}>): JSX.Element {
  return (
    <div className={`min-w-0 border-b border-[rgb(var(--app-border))]/60 pb-2 ${className}`.trim()}>
      <dt className="text-[11px] font-medium text-[rgb(var(--app-text-muted))]">{label}</dt>
      <dd
        className={`mt-1 min-w-0 break-words text-sm leading-5 text-[rgb(var(--app-text))] ${
          mono ? "break-all font-mono text-[12px]" : ""
        }`.trim()}
      >
        {children}
      </dd>
    </div>
  );
}

export function ActivityDetailSection({
  title,
  actions,
  children,
  className = "",
}: PropsWithChildren<{
  title?: string;
  actions?: ReactNode;
  className?: string;
}>): JSX.Element {
  return (
    <section className={`border-t border-[rgb(var(--app-border))] pt-4 ${className}`.trim()}>
      {(title || actions) && (
        <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
          {title ? <h3 className="text-sm font-semibold text-[rgb(var(--app-text))]">{title}</h3> : <span />}
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
