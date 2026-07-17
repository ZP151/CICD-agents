import { lazy, Suspense } from "react";
import type { ConversationArtifactPart } from "../../../chatBubbles.js";
import type { ArtifactLookupState } from "../chat.types.js";
import {
  artifactWorkspaceKindLabel,
  artifactWorkspaceStatusClass,
  artifactWorkspaceStatusLabel,
} from "./artifactWorkspaceHelpers.js";

const ArtifactWorkspaceContent = lazy(() =>
  import("./ArtifactWorkspaceContent.js").then((module) => ({
    default: module.ArtifactWorkspaceContent,
  })),
);

export function ArtifactWorkspaceShell({
  artifact,
  lookupState,
  artifactCount,
  onClear,
}: {
  artifact: ConversationArtifactPart | null;
  lookupState: ArtifactLookupState | null;
  artifactCount: number;
  onClear: () => void;
}) {
  const selectedCountLabel = artifact
    ? "1 selected"
    : artifactCount > 0
      ? `${artifactCount} available`
      : "empty";

  return (
    <section className="mt-4 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
      <div className="flex items-center justify-between gap-2 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[rgb(var(--app-text))]">Result workspace</p>
          <p className="mt-0.5 text-[11px] text-[rgb(var(--app-text-subtle))]">{selectedCountLabel}</p>
        </div>
        {artifact && (
          <button
            type="button"
            onClick={onClear}
            className="shrink-0 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-text-muted))] transition hover:bg-[rgb(var(--app-bg-muted))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px"
          >
            Clear
          </button>
        )}
      </div>
      {artifact ? (
        <div className="p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-[rgb(var(--app-text))]" title={artifact.title}>
                {artifact.title}
              </p>
              <p className="mt-1 font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">
                {artifact.artifactId}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
                {artifactWorkspaceKindLabel(artifact.artifactType)}
              </span>
              <span className={artifactWorkspaceStatusClass(artifact.status)} aria-live="polite">
                {artifactWorkspaceStatusLabel(artifact.status)}
              </span>
            </div>
          </div>
          <Suspense fallback={<ArtifactWorkspaceContentFallback />}>
            <ArtifactWorkspaceContent artifact={artifact} lookupState={lookupState} />
          </Suspense>
        </div>
      ) : (
        <div className="px-3 py-3">
          <div className="rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-3">
            <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
              No artifact selected
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[rgb(var(--app-text-subtle))]">
              {artifactCount > 0
                ? `${artifactCount} artifact${artifactCount === 1 ? "" : "s"} available in chat. Select one to inspect it here.`
                : "Generated diagrams, PR insight reports, and long review summaries will appear here after an artifact is selected."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function ArtifactWorkspaceContentFallback() {
  return (
    <div className="mt-3 rounded-md border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2" aria-live="polite">
      <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Loading result preview...</p>
      <div className="mt-2 space-y-1.5">
        <div className="h-1.5 w-4/5 rounded-full bg-[rgb(var(--app-border))]" />
        <div className="h-1.5 w-2/3 rounded-full bg-[rgb(var(--app-border))]" />
      </div>
    </div>
  );
}
