import {
  lazy,
  Suspense,
} from "react";
import type {
  ConversationArtifactPart,
  ConversationSourcePart,
} from "../../../chatBubbles.js";
import type { ArtifactLookupState } from "../chat.types.js";
import { sourceReferenceKey } from "./conversationArtifacts.js";
import { ArtifactWorkspaceShell } from "./ArtifactWorkspace.js";
import {
  sourceBadgeTone,
  sourceTypeLabel,
} from "./sourcePreviewLanguage.js";
import {
  sourceFileName,
  sourcePathDetail,
} from "./sourceWorkspaceModel.js";
import { SourcePreviewEmpty } from "./SourcePreviewEmpty.js";

export { sourceLineStartOffset } from "./sourceWorkspaceModel.js";

const SourceCodeViewport = lazy(() =>
  import("./SourceCodeViewport.js").then((module) => ({
    default: module.SourceCodeViewport,
  })),
);

function sourceSummaryLabel(source: ConversationSourcePart): string {
  if (source.type === "source_document") {
    return [sourceFileName(source), source.file].filter(Boolean).join(" · ") || "Source file";
  }
  return [source.title, source.domain, source.url].filter(Boolean).join(" · ") || "Source link";
}

export function ContextSourcePanel({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null;
  return (
    <section className="mt-4 border-t border-[rgb(var(--app-border))] pt-4">
      <p className="mb-2 text-sm text-[rgb(var(--app-text-muted))]">Context source</p>
      <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
        {sources.map((source) => (
          <p key={source}>{source}</p>
        ))}
      </div>
    </section>
  );
}

export function CodeSidePanel({
  repoPath,
  source,
  sources,
  artifact,
  artifactLookupState,
  artifactCount,
  onSourceSelect,
  onSourceClose,
  onClearSources,
  onClearArtifact,
}: {
  repoPath: string;
  source: ConversationSourcePart | null;
  sources: ConversationSourcePart[];
  artifact: ConversationArtifactPart | null;
  artifactLookupState: ArtifactLookupState | null;
  artifactCount: number;
  onSourceSelect: (source: ConversationSourcePart) => void;
  onSourceClose: (source: ConversationSourcePart) => void;
  onClearSources: () => void;
  onClearArtifact: () => void;
}) {
  const activeSource = source;
  const detail = activeSource ? sourcePathDetail(activeSource) : "";

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text))]">
      {sources.length > 0 && (
        <div className="flex shrink-0 items-center gap-1 border-b border-[rgb(var(--app-border))]">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-2">
            {sources.map((tab) => {
              const selected = activeSource ? sourceReferenceKey(tab) === sourceReferenceKey(activeSource) : false;
              return (
                <div
                  key={sourceReferenceKey(tab)}
                  className={[
                    "group inline-flex max-w-[14rem] shrink-0 items-center rounded-md border text-xs transition",
                    selected
                      ? "border-[rgb(var(--app-accent))]/45 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent))]"
                      : "border-transparent text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]",
                  ].join(" ")}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    title={sourcePathDetail(tab) || sourceSummaryLabel(tab)}
                    onClick={() => onSourceSelect(tab)}
                    className="inline-flex min-w-0 items-center gap-1.5 px-2.5 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
                  >
                    <SourceTypeBadge source={tab} />
                    <span className="min-w-0 truncate">{sourceFileName(tab)}</span>
                  </button>
                  <button
                    type="button"
                    title={`Close ${sourceFileName(tab)}`}
                    aria-label={`Close ${sourceFileName(tab)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSourceClose(tab);
                    }}
                    className="mr-1 rounded px-1 py-0.5 text-[11px] text-[rgb(var(--app-text-subtle))] opacity-70 transition hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 group-hover:opacity-100"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          <div className="shrink-0 border-l border-[rgb(var(--app-border))] px-2">
            <button
              type="button"
              title="Close all files"
              aria-label="Close all files"
              onClick={onClearSources}
              className="rounded px-1.5 py-1 text-[11px] font-medium text-[rgb(var(--app-text-subtle))] transition hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {activeSource?.type === "source_url" && (
        <div className="shrink-0 border-b border-[rgb(var(--app-border))] px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-mono text-[11px] text-[rgb(var(--app-text-subtle))]" title={sourceSummaryLabel(activeSource)}>
              {detail || sourceSummaryLabel(activeSource)}
            </p>
            <a
              href={activeSource.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-accent))] transition hover:bg-[rgb(var(--app-surface-raised))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
            >
              Open
            </a>
          </div>
        </div>
      )}

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[rgb(var(--app-bg-muted))] p-2">
        {activeSource ? (
          <Suspense fallback={<SourcePreviewEmpty label="Loading file preview..." />}>
            <SourceCodeViewport repoPath={repoPath} source={activeSource} />
          </Suspense>
        ) : artifact ? (
          <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-3">
            <ArtifactWorkspaceShell
              artifact={artifact}
              lookupState={artifactLookupState}
              artifactCount={artifactCount}
              onClear={onClearArtifact}
            />
          </div>
        ) : (
          <SourcePreviewEmpty label="No file open" />
        )}
      </div>
    </div>
  );
}

function SourceTypeBadge({ source }: { source: ConversationSourcePart }) {
  const label = source.type === "source_url" ? "WEB" : sourceTypeLabel(sourcePathDetail(source) || sourceFileName(source));
  const tone = source.type === "source_url" ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-600" : sourceBadgeTone(label);
  return (
    <span
      className={[
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border px-1 font-mono text-[8px] font-semibold leading-none",
        tone,
      ].join(" ")}
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
