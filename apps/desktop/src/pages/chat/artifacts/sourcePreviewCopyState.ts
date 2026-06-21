export type SourcePreviewCopyKind = "path" | "content";

export type SourcePreviewCopyStatus = "copied" | "failed";

export interface SourcePreviewCopyState {
  kind: SourcePreviewCopyKind;
  status: SourcePreviewCopyStatus;
}

export function sourcePreviewCopyLabel(
  kind: SourcePreviewCopyKind,
  state: SourcePreviewCopyState | null,
): string {
  if (state?.kind === kind && state.status === "copied") return "Copied";
  if (state?.kind === kind && state.status === "failed") return "Failed";
  return kind === "path" ? "Path" : "Copy";
}

export function sourcePreviewCopyClassName(
  kind: SourcePreviewCopyKind,
  state: SourcePreviewCopyState | null,
): string {
  const base =
    "rounded border border-transparent px-1.5 py-0.5 font-medium transition hover:border-[rgb(var(--app-border))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35";
  if (state?.kind === kind && state.status === "failed") {
    return `${base} text-[rgb(var(--app-warning))]`;
  }
  return base;
}
