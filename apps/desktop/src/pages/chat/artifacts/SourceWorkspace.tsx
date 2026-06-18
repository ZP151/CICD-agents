import type {
  ConversationArtifactPart,
  ConversationSourcePart,
} from "../../../chatBubbles.js";
import { ConversationPartRenderer } from "../../../components/conversation/ConversationPartRenderer.js";
import type { ArtifactLookupState } from "../chat.types.js";
import { sourceReferenceKey } from "./conversationArtifacts.js";
import { ArtifactWorkspaceShell } from "./ArtifactWorkspace.js";

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

function SourceCodeViewport({ source }: { source: ConversationSourcePart }) {
  const language = source.type === "source_document" ? languageFromSourcePath(source.file ?? source.title) : "markdown";

  if (!source.snippet) {
    return (
      <div className="flex h-full min-h-48 items-center justify-center border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-4 text-center text-xs text-[rgb(var(--app-text-subtle))]">
        No code snippet is attached to this reference yet.
      </div>
    );
  }

  return (
    <ConversationPartRenderer
      parts={[{
        type: "code",
        code: source.snippet,
        language,
        title: "Referenced code",
      }]}
    />
  );
}

export function CodeSidePanel({
  source,
  sources,
  artifact,
  artifactLookupState,
  artifactCount,
  onSourceSelect,
  onClearArtifact,
}: {
  source: ConversationSourcePart | null;
  sources: ConversationSourcePart[];
  artifact: ConversationArtifactPart | null;
  artifactLookupState: ArtifactLookupState | null;
  artifactCount: number;
  onSourceSelect: (source: ConversationSourcePart) => void;
  onClearArtifact: () => void;
}) {
  const sourceTabs = mergeSourceTabs(source, sources);
  const activeSource = source;
  const activeTitle = activeSource ? sourceFileName(activeSource) : "";
  const detail = activeSource ? sourcePathDetail(activeSource) : "";

  return (
    <div className="flex h-full w-full min-w-0 flex-col bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text))]">
      {sourceTabs.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[rgb(var(--app-border))] px-2 py-2">
          {sourceTabs.map((tab) => {
            const selected = activeSource ? sourceReferenceKey(tab) === sourceReferenceKey(activeSource) : false;
            return (
              <button
                key={sourceReferenceKey(tab)}
                type="button"
                aria-pressed={selected}
                title={sourcePathDetail(tab) || sourceSummaryLabel(tab)}
                onClick={() => onSourceSelect(tab)}
                className={[
                  "inline-flex max-w-[13rem] shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35",
                  selected
                    ? "border-[rgb(var(--app-accent))]/45 bg-[rgb(var(--app-accent-soft))] text-[rgb(var(--app-accent))]"
                    : "border-transparent text-[rgb(var(--app-text-muted))] hover:border-[rgb(var(--app-border))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))]",
                ].join(" ")}
              >
                <span className="text-[10px]">{tab.type === "source_url" ? "◎" : "▣"}</span>
                <span className="min-w-0 truncate">{sourceFileName(tab)}</span>
              </button>
            );
          })}
        </div>
      )}

      {activeSource && (
        <div className="shrink-0 border-b border-[rgb(var(--app-border))] px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-[rgb(var(--app-text))]" title={sourceSummaryLabel(activeSource)}>
                {activeTitle}
              </p>
              {detail && <p className="mt-0.5 truncate font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">{detail}</p>}
            </div>
            {activeSource.type === "source_url" && (
              <a
                href={activeSource.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-accent))] transition hover:bg-[rgb(var(--app-surface-raised))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
              >
                Open
              </a>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto bg-[rgb(var(--app-bg-muted))] p-2">
        {activeSource ? (
          <SourceCodeViewport source={activeSource} />
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
            <div className="flex h-full min-h-48 items-center justify-center border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-4 text-center text-sm leading-relaxed text-[rgb(var(--app-text-muted))]">
              Click a blue file or symbol reference in the conversation to inspect its code here.
            </div>
          )}
      </div>
    </div>
  );
}

function mergeSourceTabs(
  selectedSource: ConversationSourcePart | null,
  sources: ConversationSourcePart[],
): ConversationSourcePart[] {
  const merged: ConversationSourcePart[] = [];
  const seen = new Set<string>();
  for (const source of [selectedSource, ...sources]) {
    if (!source) continue;
    const key = sourceReferenceKey(source);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }
  return merged;
}

function sourceFileName(source: ConversationSourcePart): string {
  if (source.type === "source_url") return source.domain || source.title || "Web source";
  return source.file?.split(/[\\/]/).filter(Boolean).pop() || source.title || "Source file";
}

function sourcePathDetail(source: ConversationSourcePart): string {
  if (source.type === "source_url") return source.url;
  return source.file || stripSourceLineSuffix(source.title);
}

function stripSourceLineSuffix(title: string): string {
  return title.replace(/:(?:line\s*)?\d+$/i, "").trim();
}

function languageFromSourcePath(path?: string): string {
  const ext = path?.split(/[./\\]/).pop()?.toLowerCase();
  const languages: Record<string, string> = {
    cs: "csharp",
    cshtml: "html",
    css: "css",
    js: "javascript",
    jsx: "jsx",
    json: "json",
    md: "markdown",
    ps1: "powershell",
    py: "python",
    ts: "typescript",
    tsx: "tsx",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
  };
  return ext ? languages[ext] ?? "text" : "text";
}
