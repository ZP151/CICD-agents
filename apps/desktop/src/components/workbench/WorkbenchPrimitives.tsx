import * as Dialog from "@radix-ui/react-dialog";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from "react";

type ActionTone = "primary" | "secondary" | "danger" | "quiet";
type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface WorkbenchFilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
  title?: string;
  disabled?: boolean;
}

const actionToneClass: Record<ActionTone, string> = {
  primary:
    "border border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent))] text-white hover:brightness-110",
  secondary:
    "border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-control-hover))] hover:text-[rgb(var(--app-text))]",
  danger:
    "border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] text-[rgb(var(--app-danger))] hover:brightness-95",
  quiet:
    "border border-transparent text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-control-hover))] hover:text-[rgb(var(--app-text))]",
};

const statusToneClass: Record<StatusTone, string> = {
  neutral: "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-muted))]",
  info: "border-[rgb(var(--app-info-border))] bg-[rgb(var(--app-info-soft))] text-[rgb(var(--app-info))]",
  success: "border-[rgb(var(--app-success-border))] bg-[rgb(var(--app-success-soft))] text-[rgb(var(--app-success))]",
  warning: "border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-warning-soft))] text-[rgb(var(--app-warning))]",
  danger: "border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] text-[rgb(var(--app-danger))]",
};

export function workbenchPageClass(): string {
  return "mx-auto flex min-h-full w-full max-w-[1600px] flex-col gap-4 pb-8 max-[1100px]:gap-3";
}

export function WorkbenchPage({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <div className={`${workbenchPageClass()} ${className}`.trim()}>{children}</div>;
}

export function WorkbenchHeader({
  title,
  description,
  descriptionClassName = "",
  actions,
  children,
}: PropsWithChildren<{
  title: string;
  description?: string;
  descriptionClassName?: string;
  actions?: ReactNode;
}>) {
  return (
    <header className="flex min-w-0 flex-col gap-3 border-b border-[rgb(var(--app-border))] pb-3 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-[rgb(var(--app-text))]">{title}</h2>
        {description && <p className={`mt-1.5 max-w-3xl text-sm leading-5 text-[rgb(var(--app-text-muted))] ${descriptionClassName}`.trim()}>{description}</p>}
        {children && <div className="mt-2 flex flex-wrap items-center gap-1.5">{children}</div>}
      </div>
      {actions && <div className="min-w-0 shrink-0">{actions}</div>}
    </header>
  );
}

export function WorkbenchToolbar({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`.trim()}>{children}</div>;
}

/**
 * A shared, low-chrome filter control for worklists. It intentionally remains
 * a wrapping row instead of becoming a toolbar card, preserving usable space
 * at the 1024px desktop breakpoint.
 */
export function WorkbenchFilterTabs<T extends string>({
  ariaLabel,
  options,
  value,
  onValueChange,
  className = "",
}: {
  ariaLabel: string;
  options: readonly WorkbenchFilterOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  const layoutClass = className || "flex min-w-0 flex-wrap items-center gap-1.5";
  return (
    <div
      aria-label={ariaLabel}
      className={layoutClass}
      role="toolbar"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            title={option.title}
            onClick={() => onValueChange(option.value)}
            className={`inline-flex min-h-7 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-[background-color,border-color,color,box-shadow] duration-[var(--app-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/35 disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-text))]"
                : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-control-hover))] hover:text-[rgb(var(--app-text))]"
            }`}
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {typeof option.count === "number" && (
              <span
                className={`rounded-full px-1.5 py-px text-[10px] leading-4 ${
                  selected
                    ? "bg-[rgb(var(--app-surface))]/75 text-[rgb(var(--app-accent-readable))]"
                    : "bg-[rgb(var(--app-surface-raised))] text-[rgb(var(--app-text-subtle))]"
                }`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function ActionButton({
  tone = "secondary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ActionTone; loading?: boolean }
>) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color,transform] duration-[var(--app-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/45 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${actionToneClass[tone]} ${className}`.trim()}
    >
      {loading && <span aria-hidden="true" className="workbench-loading-indicator" />}
      {children}
    </button>
  );
}

export function WorkbenchTextInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full min-w-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs text-[rgb(var(--app-text))] outline-none transition-[background-color,border-color,box-shadow] duration-[var(--app-motion-fast)] placeholder:text-[rgb(var(--app-text-subtle))] hover:border-[rgb(var(--app-border-strong))] focus:border-[rgb(var(--app-accent))] focus:ring-2 focus:ring-[rgb(var(--app-focus))]/35 disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()}
    />
  );
}

export function WorkbenchSegmentedControl<T extends string>({
  ariaLabel,
  options,
  value,
  onValueChange,
}: {
  ariaLabel?: string;
  options: readonly { label: string; value: T; disabled?: boolean }[];
  value: T;
  onValueChange: (value: T) => void;
}) {
  return (
    <div className="workbench-segmented-control inline-flex min-w-0 gap-1 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] p-1" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            className={`min-h-7 rounded px-3 text-xs font-medium transition-[background-color,color,box-shadow,transform] duration-[var(--app-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/45 disabled:cursor-not-allowed disabled:opacity-50 ${
              selected
                ? "bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text))] shadow-sm"
                : "text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-control-hover))] hover:text-[rgb(var(--app-text))]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function WorkbenchToggle({
  checked,
  disabled = false,
  onChange,
  ariaLabel = "Toggle setting",
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-[background-color,border-color,box-shadow] duration-[var(--app-motion-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-focus))]/45 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent))]"
          : "border-[rgb(var(--app-border-strong))] bg-[rgb(var(--app-surface-raised))]"
      }`}
    >
      <span aria-hidden="true" className={`pointer-events-none h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-[var(--app-motion-fast)] ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
    </button>
  );
}

export function StatusBadge({
  tone = "neutral",
  children,
  className = "",
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; className?: string }>) {
  return (
    <span {...props} className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4 ${statusToneClass[tone]} ${className}`.trim()}>
      {children}
    </span>
  );
}

export function InlineNotice({
  tone = "info",
  title,
  children,
}: PropsWithChildren<{ tone?: Exclude<StatusTone, "neutral">; title?: string }>) {
  return (
    <section className={`rounded-md border px-3 py-2 text-sm ${statusToneClass[tone]}`} role={tone === "danger" ? "alert" : "status"}>
      {title && <p className="font-medium">{title}</p>}
      <div className={title ? "mt-0.5 text-xs leading-5 opacity-90" : "text-xs leading-5"}>{children}</div>
    </section>
  );
}

export function WorkbenchEmptyState({
  title,
  description,
  action,
  className = "",
}: {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-h-48 flex-col items-start justify-center rounded-lg border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-5 py-6 ${className}`.trim()}>
      <h3 className="text-sm font-semibold text-[rgb(var(--app-text))]">{title}</h3>
      <p className="mt-1 max-w-xl text-sm leading-5 text-[rgb(var(--app-text-muted))]">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </section>
  );
}

export function WorkbenchSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-label="Loading workspace content" className="space-y-2" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="workbench-skeleton-block h-16 rounded-md border border-[rgb(var(--app-border))]" />
      ))}
    </div>
  );
}

export function WorkbenchSidePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
}: PropsWithChildren<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
}>) {
  if (typeof document === "undefined") {
    if (!open) return null;
    return (
      <aside aria-label={title} className="fixed inset-y-0 right-0 z-50 flex w-[min(36rem,calc(100vw-1rem))] flex-col border-l border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
        <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--app-border))] px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-[rgb(var(--app-text))]">{title}</h3>
            {description && <p className="mt-1 text-xs leading-5 text-[rgb(var(--app-text-muted))]">{description}</p>}
          </div>
          <ActionButton aria-label={`Close ${title}`} tone="quiet" className="shrink-0 px-2" onClick={() => onOpenChange(false)}>Close</ActionButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="workbench-side-overlay fixed inset-0 z-40 bg-[rgb(var(--app-overlay))]/45" />
        <Dialog.Content className="workbench-side-panel fixed inset-y-0 right-0 z-50 flex w-[min(36rem,calc(100vw-1rem))] flex-col border-l border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] shadow-[-10px_0_24px_rgb(0_0_0_/_0.18)] outline-none">
          <div className="flex items-start justify-between gap-3 border-b border-[rgb(var(--app-border))] px-4 py-3">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-semibold text-[rgb(var(--app-text))]">{title}</Dialog.Title>
              {description && <Dialog.Description className="mt-1 text-xs leading-5 text-[rgb(var(--app-text-muted))]">{description}</Dialog.Description>}
            </div>
            <Dialog.Close asChild>
              <ActionButton aria-label={`Close ${title}`} tone="quiet" className="shrink-0 px-2">Close</ActionButton>
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
