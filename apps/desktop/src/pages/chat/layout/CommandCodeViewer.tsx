import CodeMirror, { EditorView, type Extension } from "@uiw/react-codemirror";
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { diff } from "@codemirror/legacy-modes/mode/diff";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import type { CommandCodeLanguage } from "./commandLanguage.js";

export function CommandCodeViewer({
  value,
  language,
  ariaLabel,
  output = false,
}: {
  value: string;
  language: CommandCodeLanguage;
  ariaLabel: string;
  output?: boolean;
}) {
  return (
    <div className={output ? "max-h-[260px] overflow-auto" : "max-h-[150px] overflow-auto"} aria-label={ariaLabel}>
      <CodeMirror
        value={value}
        editable={false}
        readOnly
        basicSetup={{
          lineNumbers: output,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          searchKeymap: true,
        }}
        extensions={[commandCodeTheme, syntaxHighlighting(commandHighlightStyle), commandLanguageExtension(language)]}
      />
    </div>
  );
}

const commandCodeTheme = EditorView.theme({
  "&": { fontSize: "12.5px", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", lineHeight: "1.62", overflow: "visible" },
  ".cm-content": { padding: "6px 16px 8px" },
  ".cm-gutters": { backgroundColor: "transparent", border: "none", color: "rgb(var(--app-text-subtle))" },
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
