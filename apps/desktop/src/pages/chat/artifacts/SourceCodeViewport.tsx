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
import type { ConversationSourcePart } from "../../../chatBubbles.js";
import {
  fetchWorkspaceFile,
  WorkspaceFilePreviewError,
  type WorkspaceFilePreview,
} from "../../../api.js";
import {
  languageFromSourcePath,
} from "./sourcePreviewLanguage.js";
import {
  sourcePreviewCopyClassName,
  sourcePreviewCopyLabel,
  type SourcePreviewCopyKind,
  type SourcePreviewCopyState,
} from "./sourcePreviewCopyState.js";
import { SourcePreviewEmpty } from "./SourcePreviewEmpty.js";
import {
  formatBytes,
  sourceLineStartOffset,
  sourcePathDetail,
} from "./sourceWorkspaceModel.js";
import { sourcePreviewSnippetFallbackNotice } from "./sourcePreviewLoadState.js";

interface SourceLoadState {
  status: "idle" | "loading" | "loaded" | "error";
  data?: WorkspaceFilePreview;
  message?: string;
}

export function SourceCodeViewport({
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
    <div className={sourceCodeViewportShellClass()}>
      <div className={sourceCodeViewportHeaderClass()}>
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
        <div className={sourceCodeViewportActionsClass()}>
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
      <div className={sourceCodeViewportEditorClass()}>
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
          {sourcePreviewSnippetFallbackNotice({ message: state.message })}
        </div>
      )}
    </div>
  );
}

function sourcePreviewErrorMessage(error: unknown): string {
  if (error instanceof WorkspaceFilePreviewError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export function sourceCodeViewportShellClass(): string {
  return "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]";
}

export function sourceCodeViewportHeaderClass(): string {
  return "flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-[rgb(var(--app-border))] px-3 py-1.5 text-[11px] text-[rgb(var(--app-text-subtle))]";
}

export function sourceCodeViewportActionsClass(): string {
  return "flex min-w-0 shrink-0 items-center gap-1";
}

export function sourceCodeViewportEditorClass(): string {
  return "min-h-0 min-w-0 flex-1 overflow-hidden";
}

const sourcePreviewTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "12px",
    overflow: "hidden",
  },
  "&.cm-editor": {
    height: "100%",
    width: "100%",
  },
  ".cm-editor": {
    height: "100%",
  },
  ".cm-content": {
    minWidth: "max-content",
  },
  ".cm-line": {
    paddingLeft: "12px",
    whiteSpace: "pre",
  },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: "1.55",
    overflow: "auto",
    scrollbarGutter: "stable both-edges",
  },
  ".cm-gutters": {
    backgroundColor: "rgb(var(--app-bg-muted))",
    borderRight: "1px solid rgb(var(--app-border))",
    color: "rgb(var(--app-text-subtle))",
    display: "flex",
    flexShrink: 0,
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
