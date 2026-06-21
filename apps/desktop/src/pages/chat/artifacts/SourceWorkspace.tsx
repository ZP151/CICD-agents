import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import CodeMirror, {
  Decoration,
  EditorView,
  StateField,
  type DecorationSet,
  type Extension,
} from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { StreamLanguage } from "@codemirror/language";
import { c, cpp, csharp, java } from "@codemirror/legacy-modes/mode/clike";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { dockerFile } from "@codemirror/legacy-modes/mode/dockerfile";
import { go } from "@codemirror/legacy-modes/mode/go";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { perl } from "@codemirror/legacy-modes/mode/perl";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { toml } from "@codemirror/legacy-modes/mode/toml";
import type {
  ConversationArtifactPart,
  ConversationSourcePart,
} from "../../../chatBubbles.js";
import { stripSourceLineSuffix } from "../../../components/conversation/sourceTitleUtils.js";
import {
  fetchWorkspaceFile,
  WorkspaceFilePreviewError,
  type WorkspaceFilePreview,
} from "../../../api.js";
import type { ArtifactLookupState } from "../chat.types.js";
import { sourceReferenceKey } from "./conversationArtifacts.js";
import { ArtifactWorkspaceShell } from "./ArtifactWorkspace.js";
import {
  languageFromSourcePath,
  sourceBadgeTone,
  sourceTypeLabel,
} from "./sourcePreviewLanguage.js";
import {
  sourcePreviewCopyClassName,
  sourcePreviewCopyLabel,
  type SourcePreviewCopyKind,
  type SourcePreviewCopyState,
} from "./sourcePreviewCopyState.js";

interface SourceLoadState {
  status: "idle" | "loading" | "loaded" | "error";
  data?: WorkspaceFilePreview;
  message?: string;
}

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

function SourceCodeViewport({
  repoPath,
  source,
}: {
  repoPath: string;
  source: ConversationSourcePart;
}) {
  const editorViewRef = useRef<EditorView | null>(null);
  const [state, setState] = useState<SourceLoadState>({ status: "idle" });
  const [copyState, setCopyState] = useState<SourcePreviewCopyState | null>(null);
  const filePath = source.type === "source_document" ? sourcePathDetail(source) : "";
  const fallbackContent = source.type === "source_document" ? source.snippet ?? "" : "";
  const targetLine = source.type === "source_document" ? source.line : undefined;

  useEffect(() => {
    if (source.type !== "source_document" || !filePath || !repoPath) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void fetchWorkspaceFile(repoPath, filePath)
      .then((data) => {
        if (!cancelled) setState({ status: "loaded", data });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: sourcePreviewErrorMessage(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filePath, repoPath, source.type]);

  const preview = state.data;
  const content = preview?.content ?? fallbackContent;
  const language = languageFromSourcePath(preview?.path ?? filePath);
  const displayPath = preview?.path ?? filePath;
  const targetLineLabel = Number.isInteger(targetLine) && (targetLine ?? 0) > 0 ? `line ${targetLine}` : null;
  const scrollToTargetLine = useCallback((view: EditorView | null) => {
    const offset = sourceLineStartOffset(content, targetLine);
    if (!view || offset === null) return;
    view.dispatch({
      effects: EditorView.scrollIntoView(offset, { y: "center" }),
    });
  }, [content, targetLine]);

  useEffect(() => {
    const frame = globalThis.requestAnimationFrame?.(() => scrollToTargetLine(editorViewRef.current));
    return () => {
      if (typeof frame === "number") globalThis.cancelAnimationFrame?.(frame);
    };
  }, [scrollToTargetLine]);

  if (source.type === "source_url") {
    return <SourcePreviewEmpty label="Web source" detail="Open in browser." />;
  }

  const copyText = async (kind: SourcePreviewCopyKind, text: string) => {
    if (!text) return;
    try {
      const clipboard = globalThis.navigator?.clipboard;
      if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
      await clipboard.writeText(text);
      setCopyState({ kind, status: "copied" });
    } catch {
      setCopyState({ kind, status: "failed" });
    }
    globalThis.window?.setTimeout(() => {
      setCopyState((current) => (current?.kind === kind ? null : current));
    }, 1400);
  };

  if (!content && state.status === "loading") {
    return <SourcePreviewEmpty label="Loading file..." />;
  }

  if (!content && state.status === "error") {
    return (
      <SourcePreviewEmpty
        label="Unable to load the full file."
        detail={state.message ?? "No file content is available."}
      />
    );
  }

  if (!content) {
    return <SourcePreviewEmpty label="No preview available" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[rgb(var(--app-border))] px-3 py-1.5 text-[11px] text-[rgb(var(--app-text-subtle))]">
        <span className="min-w-0 flex-1 truncate font-mono" title={displayPath}>
          {displayPath}
        </span>
        <span className="shrink-0">
          {preview ? `${preview.lineCount} lines · ${formatBytes(preview.size)}` : "snippet"}
        </span>
        {targetLineLabel && (
          <span className="shrink-0 rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 font-mono">
            {targetLineLabel}
          </span>
        )}
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => void copyText("path", displayPath)}
            className={sourcePreviewCopyClassName("path", copyState)}
            title="Copy file path"
          >
            {sourcePreviewCopyLabel("path", copyState)}
          </button>
          <button
            type="button"
            onClick={() => void copyText("content", content)}
            className={sourcePreviewCopyClassName("content", copyState)}
            title="Copy file content"
          >
            {sourcePreviewCopyLabel("content", copyState)}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <CodeMirror
          value={content}
          height="100%"
          minHeight="100%"
          basicSetup={{
            foldGutter: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            lineNumbers: true,
            searchKeymap: true,
          }}
          editable={false}
          readOnly
          extensions={[
            sourcePreviewTheme,
            sourceTargetLineExtension(targetLine),
            ...extensionsFromLanguage(language),
          ]}
          theme="light"
          onCreateEditor={(view) => {
            editorViewRef.current = view;
            globalThis.requestAnimationFrame?.(() => scrollToTargetLine(view));
          }}
        />
      </div>
      {state.status === "error" && fallbackContent && (
        <div className="shrink-0 border-t border-[rgb(var(--app-border))] px-3 py-1.5 text-[11px] text-[rgb(var(--app-warning))]">
          Showing attached snippet because the full file could not be loaded.
        </div>
      )}
    </div>
  );
}

function SourcePreviewEmpty({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center px-4 text-center text-xs text-[rgb(var(--app-text-subtle))]">
      <p className="font-medium text-[rgb(var(--app-text-muted))]">{label}</p>
      {detail && <p className="mt-1 max-w-[34ch] break-words text-[11px]">{detail}</p>}
    </div>
  );
}

function sourcePreviewErrorMessage(error: unknown): string {
  if (error instanceof WorkspaceFilePreviewError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
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
    <div className="flex h-full w-full min-w-0 flex-col bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text))]">
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

      <div className="min-h-0 flex-1 overflow-auto bg-[rgb(var(--app-bg-muted))] p-2">
        {activeSource ? (
          <SourceCodeViewport repoPath={repoPath} source={activeSource} />
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

const sourcePreviewTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12px",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: "1.55",
  },
  ".cm-gutters": {
    backgroundColor: "rgb(var(--app-bg-muted))",
    borderRight: "1px solid rgb(var(--app-border))",
    color: "rgb(var(--app-text-subtle))",
  },
  ".cm-line": {
    paddingLeft: "12px",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-selectionBackground": {
    backgroundColor: "rgb(var(--app-accent-soft)) !important",
  },
  ".cm-sourceTargetLine": {
    backgroundColor: "rgb(var(--app-accent-soft))",
    boxShadow: "inset 2px 0 0 rgb(var(--app-accent))",
  },
});

export function sourceTargetLineExtension(line: number | undefined): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return sourceTargetLineDecorations({
        line,
        lineCount: state.doc.lines,
        lineStart: (lineNumber) => state.doc.line(lineNumber).from,
      });
    },
    update(decorations, transaction) {
      if (!transaction.docChanged) return decorations;
      return sourceTargetLineDecorations({
        line,
        lineCount: transaction.state.doc.lines,
        lineStart: (lineNumber) => transaction.state.doc.line(lineNumber).from,
      });
    },
    provide(field) {
      return EditorView.decorations.from(field);
    },
  });
}

function sourceTargetLineDecorations({
  line,
  lineCount,
  lineStart,
}: {
  line: number | undefined;
  lineCount: number;
  lineStart: (line: number) => number;
}): DecorationSet {
  if (!Number.isInteger(line) || (line ?? 0) < 1 || (line ?? 0) > lineCount) return Decoration.none;
  return Decoration.set([
    Decoration.line({ class: "cm-sourceTargetLine" }).range(lineStart(line ?? 1)),
  ]);
}

function extensionsFromLanguage(language: string): Extension[] {
  switch (language) {
    case "c":
      return [StreamLanguage.define(c)];
    case "cpp":
      return [StreamLanguage.define(cpp)];
    case "csharp":
      return [StreamLanguage.define(csharp)];
    case "css":
      return [css()];
    case "diff":
      return [StreamLanguage.define(diff)];
    case "dockerfile":
      return [StreamLanguage.define(dockerFile)];
    case "go":
      return [StreamLanguage.define(go)];
    case "html":
      return [html()];
    case "java":
      return [StreamLanguage.define(java)];
    case "javascript":
    case "jsx":
      return [javascript({ jsx: true })];
    case "json":
      return [json()];
    case "lua":
      return [StreamLanguage.define(lua)];
    case "markdown":
      return [markdown()];
    case "perl":
      return [StreamLanguage.define(perl)];
    case "powershell":
      return [StreamLanguage.define(powerShell)];
    case "python":
      return [python()];
    case "ruby":
      return [StreamLanguage.define(ruby)];
    case "rust":
      return [StreamLanguage.define(rust)];
    case "shell":
      return [StreamLanguage.define(shell)];
    case "sql":
      return [sql()];
    case "swift":
      return [StreamLanguage.define(swift)];
    case "toml":
      return [StreamLanguage.define(toml)];
    case "typescript":
    case "tsx":
      return [javascript({ jsx: language === "tsx", typescript: true })];
    case "xml":
      return [xml()];
    case "yaml":
      return [yaml()];
    default:
      return [];
  }
}

function sourceFileName(source: ConversationSourcePart): string {
  if (source.type === "source_url") return source.domain || source.title || "Web source";
  return source.file?.split(/[\\/]/).filter(Boolean).pop() || source.title || "Source file";
}

function sourcePathDetail(source: ConversationSourcePart): string {
  if (source.type === "source_url") return source.url;
  return source.file || stripSourceLineSuffix(source.title);
}

export function sourceLineStartOffset(content: string, line: number | undefined): number | null {
  if (!Number.isInteger(line) || (line ?? 0) < 1) return null;
  if (line === 1) return 0;

  let currentLine = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) !== 10) continue;
    currentLine += 1;
    if (currentLine === line) return index + 1;
  }

  return null;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
