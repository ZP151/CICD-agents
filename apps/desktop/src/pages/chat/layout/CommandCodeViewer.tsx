import CodeMirror, { EditorView, type Extension } from "@uiw/react-codemirror";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { useState } from "react";
import type { CommandCodeLanguage } from "./commandLanguage.js";

export function commandCodeViewerSetup(output: boolean) {
  return {
    // Commands are concise enough to scan without a gutter. Output benefits
    // from stable line references, particularly for PowerShell errors/diffs.
    lineNumbers: output,
    foldGutter: false,
    highlightActiveLine: false,
    highlightActiveLineGutter: false,
    searchKeymap: true,
  };
}

export function CommandCodeViewer({
  value,
  language,
  ariaLabel,
  output = false,
  copyValue,
}: {
  value: string;
  language: CommandCodeLanguage;
  ariaLabel: string;
  output?: boolean;
  copyValue?: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const copy = async () => {
    if (!copyValue) return;
    try {
      await navigator.clipboard.writeText(copyValue);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    window.setTimeout(() => setCopyStatus("idle"), 1200);
  };

  return (
    <div className={`relative ${output ? "max-h-[260px]" : "max-h-[150px]"}`} aria-label={ariaLabel}>
      <CodeMirror
        value={value}
        editable={false}
        readOnly
        basicSetup={commandCodeViewerSetup(output)}
        extensions={[commandCodeTheme, syntaxHighlighting(commandHighlightStyle), commandLanguageExtension(language)]}
      />
      {copyValue && (
        <button
          type="button"
          onClick={() => void copy()}
          title={copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy command"}
          aria-label={copyStatus === "copied" ? "Command copied" : copyStatus === "failed" ? "Copy command failed" : "Copy command"}
          className={`absolute right-2 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-[rgb(var(--app-text-subtle))] transition-[background,color] duration-150 hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-[rgb(var(--app-focus))] ${
            copyStatus === "failed" ? "text-[rgb(var(--app-danger))]" : ""
          }`}
        >
          <CopyIcon />
        </button>
      )}
    </div>
  );
}

const commandCodeTheme = EditorView.theme({
  "&": { fontSize: "12.5px", backgroundColor: "transparent" },
  "&.cm-editor": { backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", lineHeight: "1.62", overflow: "auto", scrollbarGutter: "stable both-edges" },
  ".cm-content": { minWidth: "max-content", padding: "6px 16px 8px" },
  ".cm-gutters": { minHeight: "100%", backgroundColor: "rgb(var(--app-surface))", borderRight: "1px solid rgb(var(--app-border))", color: "rgb(var(--app-text-subtle))" },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "2.4rem", padding: "0 0.7rem 0 0.45rem" },
  ".cm-line": { padding: "0" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-selectionBackground": { backgroundColor: "rgb(var(--app-accent-soft)) !important" },
});

const commandHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: "rgb(var(--app-accent))" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "rgb(var(--app-success))" },
  { tag: [tags.number, tags.bool, tags.null], color: "rgb(var(--app-warning))" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "rgb(var(--app-text-subtle))", fontStyle: "italic" },
  { tag: [tags.variableName, tags.propertyName], color: "rgb(var(--app-text))" },
  { tag: [tags.heading, tags.contentSeparator], color: "rgb(var(--app-danger))" },
]);

function commandLanguageExtension(language: CommandCodeLanguage): Extension {
  if (language === "powershell") return StreamLanguage.define(powerShell);
  if (language === "diff") return StreamLanguage.define(diff);
  return StreamLanguage.define(shell);
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.25" y="2.25" width="8.5" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.75 11.75v.5A1.5 1.5 0 0 1 9.25 13.75h-6A1.5 1.5 0 0 1 1.75 12.25v-6a1.5 1.5 0 0 1 1.5-1.5h.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
