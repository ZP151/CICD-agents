import { Children, useCallback, useMemo, useState, type ReactNode } from "react";
import { highlightCodeHtml } from "./codeHighlight.js";
import { conversationActionButtonClass } from "./conversationPartStyles.js";

export function CodeBlock({
  code,
  language,
  title,
}: {
  code: string;
  language?: string;
  title?: string;
}) {
  const shouldCollapse = isLongCode(code);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(!shouldCollapse);
  const visibleCode = expanded ? code : collapseCode(code);
  const normalizedLanguage = normalizeCodeLanguage(language);
  const highlightedHtml = useMemo(
    () => highlightCodeHtml(visibleCode, normalizedLanguage),
    [normalizedLanguage, visibleCode],
  );

  const copyCode = useCallback(() => {
    if (!code || typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
  }, [code]);

  return (
    <div className="overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-bg-muted))] shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-3 py-1.5 text-[11px] text-[rgb(var(--app-text-subtle))]">
        <span className="min-w-0 truncate">{title ?? "Code"}</span>
        <div className="flex shrink-0 items-center gap-2">
          {language && <span className="rounded border border-[rgb(var(--app-border))] px-1.5 py-0.5 font-mono uppercase tracking-wide">{language.toUpperCase()}</span>}
          {shouldCollapse && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={conversationActionButtonClass}
            >
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          <button
            type="button"
            onClick={copyCode}
            className={conversationActionButtonClass}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="conversation-code-highlight max-h-80 overflow-auto px-3 py-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
        <code
          className="font-mono"
          data-raw-code={visibleCode}
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      </pre>
      {!expanded && shouldCollapse && (
        <div className="border-t border-[rgb(var(--app-border))] px-3 py-1.5 text-[11px] text-[rgb(var(--app-text-subtle))]">
          Showing first {COLLAPSED_CODE_LINES} lines. Copy still uses the full block.
        </div>
      )}
    </div>
  );
}

export function childrenToText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : ""))
    .join("");
}

const COLLAPSED_CODE_LINES = 28;
const LONG_CODE_CHAR_THRESHOLD = 2200;

function isLongCode(code: string): boolean {
  return code.split(/\r?\n/).length > COLLAPSED_CODE_LINES || code.length > LONG_CODE_CHAR_THRESHOLD;
}

function collapseCode(code: string): string {
  const lines = code.split(/\r?\n/);
  if (lines.length > COLLAPSED_CODE_LINES) {
    return lines.slice(0, COLLAPSED_CODE_LINES).join("\n");
  }
  return code.slice(0, LONG_CODE_CHAR_THRESHOLD);
}

function normalizeCodeLanguage(language?: string): string {
  const normalized = language?.toLowerCase().trim();
  if (!normalized) return "text";
  const aliases: Record<string, string> = {
    csharp: "csharp",
    cs: "csharp",
    js: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    ps1: "powershell",
    pwsh: "powershell",
    shell: "bash",
    sh: "bash",
    yml: "yaml",
  };
  return aliases[normalized] ?? normalized;
}
