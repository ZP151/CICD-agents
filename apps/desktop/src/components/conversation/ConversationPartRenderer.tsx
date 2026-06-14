import { Children, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { ConversationArtifactPart, ConversationPart } from "../../chatBubbles.js";

interface ConversationPartRendererProps {
  parts: ConversationPart[];
  streaming?: boolean;
  typingIndicator?: ReactNode;
  selectedArtifactId?: string | null;
  onArtifactSelect?: (artifact: ConversationArtifactPart) => void;
}

export function ConversationPartRenderer({
  parts,
  streaming = false,
  typingIndicator,
  selectedArtifactId,
  onArtifactSelect,
}: ConversationPartRendererProps) {
  const visibleParts = parts.filter((part) => part.type !== "metadata");
  if (visibleParts.length === 0 && !streaming) return null;
  const renderItems = groupReferenceParts(visibleParts);

  return (
    <div className="space-y-2">
      {renderItems.map((item, index) => (
        item.type === "references"
          ? <ReferenceGroup key={`references-${index}`} sources={item.sources} />
          : (
              <ConversationPartView
                key={partKey(item.part, index)}
                part={item.part}
                selectedArtifactId={selectedArtifactId}
                onArtifactSelect={onArtifactSelect}
              />
            )
      ))}
      {streaming && typingIndicator}
    </div>
  );
}

function ConversationPartView({
  part,
  selectedArtifactId,
  onArtifactSelect,
}: {
  part: ConversationPart;
  selectedArtifactId?: string | null;
  onArtifactSelect?: (artifact: ConversationArtifactPart) => void;
}) {
  switch (part.type) {
    case "text":
      return <MarkdownContent markdown={part.text} />;

    case "markdown":
      return <MarkdownContent markdown={part.markdown} />;

    case "code":
      return (
        <CodeBlock
          code={part.code}
          language={part.language}
          title={part.title ?? part.fileName}
        />
      );

    case "source_document":
      return (
        <SourceCard
          label="Source"
          title={part.title}
          detail={[part.file, part.line ? `line ${part.line}` : ""].filter(Boolean).join(":")}
          snippet={part.snippet}
        />
      );

    case "source_url":
      return (
        <SourceCard
          label={part.domain ?? "Web"}
          title={part.title}
          detail={part.url}
          snippet={part.snippet}
          href={part.url}
        />
      );

    case "tool_call":
      return (
        <div className={conversationPartCardClass}>
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-[rgb(var(--app-accent))]">{part.toolName}</span>
            <span className={inlineStatePillClass(part.state === "error" ? "error" : part.state === "result" ? "ready" : "running")}>
              {part.state}
            </span>
          </div>
          {part.summary && <p className="mt-1 text-[rgb(var(--app-text-muted))]">{part.summary}</p>}
        </div>
      );

    case "tool_approval":
      return (
        <div className={conversationPartCardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-[rgb(var(--app-text))]">Approval required</span>
            <span className={approvalRiskPillClass(part.riskLevel)}>{part.riskLevel ?? "approval"}</span>
          </div>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-[rgb(var(--app-text))]">{part.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[rgb(var(--app-text-subtle))]">
            <span className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-1.5 py-0.5 font-mono">
              {part.toolName}
            </span>
            <span>Review the scoped action before continuing.</span>
          </div>
        </div>
      );

    case "file":
      return (
        <SourceCard
          label={part.mediaType ?? "File"}
          title={part.fileName}
          detail={part.localPath ?? part.url}
          href={part.url}
        />
      );

    case "artifact":
      return (
        <ArtifactCard
          part={part}
          selected={part.artifactId === selectedArtifactId}
          onSelect={onArtifactSelect}
        />
      );

    case "process_step":
      return (
        <div className={`flex items-start gap-2 ${conversationPartCardClass}`}>
          <span className={statusDotClass(part.status)} />
          <span className="min-w-0">
            <span className="block font-medium text-[rgb(var(--app-text))]">{part.label}</span>
            {part.detail && <span className="mt-0.5 block text-[rgb(var(--app-text-muted))]">{part.detail}</span>}
          </span>
        </div>
      );

    case "suggested_reply":
      return (
        <button
          type="button"
          className="rounded-md border border-[rgb(var(--app-border))] px-2.5 py-1 text-xs text-[rgb(var(--app-text-muted))]"
          disabled
          title={part.message}
        >
          {part.label}
        </button>
      );

    case "metadata":
      return null;
  }
}

type ReferencePart = Extract<ConversationPart, { type: "source_document" | "source_url" }>;

const conversationPartCardClass =
  "rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-xs";

const conversationActionButtonClass =
  "rounded-md border border-[rgb(var(--app-border))] px-1.5 py-0.5 text-[10px] font-medium text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px";

type RenderItem =
  | { type: "part"; part: ConversationPart }
  | { type: "references"; sources: ReferencePart[] };

function groupReferenceParts(parts: ConversationPart[]): RenderItem[] {
  const items: RenderItem[] = [];
  let pendingSources: ReferencePart[] = [];
  const flush = (): void => {
    if (!pendingSources.length) return;
    items.push({ type: "references", sources: pendingSources });
    pendingSources = [];
  };

  for (const part of parts) {
    if (part.type === "source_document" || part.type === "source_url") {
      pendingSources.push(part);
      continue;
    }
    flush();
    items.push({ type: "part", part });
  }
  flush();
  return items;
}

function ReferenceGroup({ sources }: { sources: ReferencePart[] }) {
  const [expanded, setExpanded] = useState(false);
  const documentCount = sources.filter((source) => source.type === "source_document").length;
  const webCount = sources.length - documentCount;
  const summary = [
    documentCount ? `${documentCount} file${documentCount === 1 ? "" : "s"}` : "",
    webCount ? `${webCount} link${webCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
  const primarySources = sources.slice(0, 4);
  const remainingCount = Math.max(0, sources.length - primarySources.length);

  return (
    <div className="rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-2.5 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2 py-1 text-[11px] font-medium text-[rgb(var(--app-text-muted))] transition hover:border-[rgb(var(--app-border-strong))] hover:text-[rgb(var(--app-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
          aria-expanded={expanded}
        >
          <span className="text-[rgb(var(--app-text-subtle))]">{expanded ? "Hide" : "Sources"}</span>
          <span>{summary || `${sources.length} reference${sources.length === 1 ? "" : "s"}`}</span>
        </button>
        {primarySources.map((source, index) => (
          <ReferenceChip key={referenceKey(source, index)} source={source} />
        ))}
        {remainingCount > 0 && (
          <span className="rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-subtle))]">
            +{remainingCount}
          </span>
        )}
      </div>
      {expanded && (
        <div className="mt-2 overflow-hidden rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))]">
          <div className="divide-y divide-[rgb(var(--app-border))]">
            {sources.map((source, index) => (
              <ReferenceRow key={referenceKey(source, index)} source={source} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReferenceChip({ source }: { source: ReferencePart }) {
  const title = source.title || (source.type === "source_document" ? source.file : source.domain) || "Source";
  const label = truncateMiddle(title, 34);
  const className = "inline-flex max-w-[13rem] items-center gap-1 rounded-md border border-[rgb(var(--app-border))] px-2 py-1 text-[11px] text-[rgb(var(--app-text-subtle))] transition hover:border-[rgb(var(--app-border-strong))] hover:bg-[rgb(var(--app-surface-raised))] hover:text-[rgb(var(--app-text-muted))]";
  if (source.type === "source_url") {
    return (
      <a href={source.url} target="_blank" rel="noreferrer" className={className} title={source.url}>
        <span className="shrink-0">{source.domain ? "web" : "url"}</span>
        <span className="min-w-0 truncate">{label}</span>
      </a>
    );
  }
  return (
    <span className={className} title={[source.file, source.line ? `line ${source.line}` : ""].filter(Boolean).join(":") || source.title}>
      <span className="shrink-0">file</span>
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function ReferenceRow({ source }: { source: ReferencePart }) {
  const label = source.type === "source_document" ? "File" : source.domain ?? "Web";
  const detail = source.type === "source_document"
    ? [source.file, source.line ? `line ${source.line}` : ""].filter(Boolean).join(":")
    : source.url;
  const content = (
    <div className="px-3 py-2.5">
      <p className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">{label}</p>
      <p className="mt-0.5 font-medium leading-snug text-[rgb(var(--app-text))]">{source.title}</p>
      {detail && <p className="mt-0.5 break-all font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">{detail}</p>}
      {source.snippet && (
        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[rgb(var(--app-text-muted))]">{source.snippet}</p>
      )}
    </div>
  );
  if (source.type === "source_url") {
    return (
      <a href={source.url} target="_blank" rel="noreferrer" className="block transition hover:bg-[rgb(var(--app-surface-raised))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35">
        {content}
      </a>
    );
  }
  return content;
}

function ArtifactCard({
  part,
  selected = false,
  onSelect,
}: {
  part: ConversationArtifactPart;
  selected?: boolean;
  onSelect?: (artifact: ConversationArtifactPart) => void;
}) {
  const kind = artifactKindLabel(part.artifactType);
  const status = artifactStatusLabel(part.status);
  const summary = artifactSummary(part.artifactType, part.status);
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
            <span className={artifactStatusDotClass(part.status)} />
            Result artifact
          </p>
          <p className="mt-1 truncate font-medium text-[rgb(var(--app-text))]" title={part.title}>
            {part.title}
          </p>
          <p className="mt-1 leading-relaxed text-[rgb(var(--app-text-muted))]">
            {summary}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <span className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-subtle))]">
            {kind}
          </span>
          <span className={artifactStatusClass(part.status)}>{status}</span>
        </div>
      </div>
      <div className="mt-2 border-t border-[rgb(var(--app-border))] pt-2 text-[11px] text-[rgb(var(--app-text-subtle))]">
        {onSelect
          ? "Open in the Result workspace to inspect, copy, or download the full content."
          : "Available as a Result workspace artifact when this conversation is interactive."}
      </div>
    </>
  );

  const cardClass = [
    "rounded-md border bg-[rgb(var(--app-surface-raised))] px-3 py-2 text-left text-xs transition",
    selected ? "border-blue-500/60 bg-[rgb(var(--app-accent-soft))] ring-1 ring-blue-500/20" : "border-[rgb(var(--app-border))]",
  ].join(" ");

  if (onSelect) {
    return (
      <button
        type="button"
        className={`${cardClass} block w-full hover:border-blue-500/50 hover:bg-[rgb(var(--app-surface))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35 active:translate-y-px`}
        data-artifact-id={part.artifactId}
        aria-pressed={selected}
        aria-label={`Open artifact workspace for ${part.title}`}
        onClick={() => onSelect(part)}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cardClass}
      data-artifact-id={part.artifactId}
    >
      {content}
    </div>
  );
}

function artifactKindLabel(type: ConversationArtifactPart["artifactType"]): string {
  const labels: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "Preview",
    markdown: "Report",
    mermaid: "Diagram",
    react: "Preview",
    text: "Text",
  };
  return labels[type];
}

function artifactStatusLabel(status: ConversationArtifactPart["status"]): string {
  const labels: Record<ConversationArtifactPart["status"], string> = {
    error: "Error",
    ready: "Ready",
    streaming: "Streaming",
  };
  return labels[status];
}

function artifactSummary(
  type: ConversationArtifactPart["artifactType"],
  status: ConversationArtifactPart["status"],
): string {
  if (status === "streaming") return "The agent is still building this result. The card stays compact while content streams.";
  if (status === "error") return "The result failed to finish. The artifact stays visible so the next action has context.";

  const summaries: Record<ConversationArtifactPart["artifactType"], string> = {
    html: "A rendered preview result is available in the Result workspace.",
    markdown: "A structured markdown report is available in the Result workspace.",
    mermaid: "A diagram result is available in the Result workspace.",
    react: "An interactive preview result is available in the Result workspace.",
    text: "A text result is available in the Result workspace.",
  };
  return summaries[type];
}

function artifactStatusClass(status: ConversationArtifactPart["status"]): string {
  const classes: Record<ConversationArtifactPart["status"], string> = {
    error: inlineStatePillClass("error"),
    ready: inlineStatePillClass("ready"),
    streaming: inlineStatePillClass("running"),
  };
  return classes[status];
}

function artifactStatusDotClass(status: ConversationArtifactPart["status"]): string {
  const color = status === "error" ? "bg-red-500" : status === "ready" ? "bg-emerald-500" : "bg-blue-500";
  const motion = status === "streaming" ? " animate-pulse" : "";
  return `h-1.5 w-1.5 rounded-full ${color}${motion}`;
}

function MarkdownContent({ markdown }: { markdown: string }) {
  const renderableMarkdown = useMemo(() => stabilizeStreamingMarkdown(markdown), [markdown]);
  const components = useMemo<Components>(
    () => ({
      h1: ({ children }) => (
        <h1 className="mb-2 mt-3 text-lg font-semibold leading-tight text-[rgb(var(--app-text))] first:mt-0">
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 className="mb-2 mt-3 text-base font-semibold leading-tight text-[rgb(var(--app-text))] first:mt-0">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="mb-1.5 mt-3 text-sm font-semibold leading-tight text-[rgb(var(--app-text))] first:mt-0">
          {children}
        </h3>
      ),
      p: ({ children }) => (
        <p className="my-2 max-w-[72ch] whitespace-pre-wrap leading-relaxed first:mt-0 last:mb-0">
          {children}
        </p>
      ),
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-blue-400 underline decoration-blue-400/40 underline-offset-2 transition hover:text-blue-300"
        >
          {children}
        </a>
      ),
      ul: ({ children }) => (
        <ul className="my-2 ml-5 list-disc space-y-1.5 marker:text-[rgb(var(--app-accent))] first:mt-0 last:mb-0">
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol className="my-2 ml-5 list-decimal space-y-1.5 marker:font-semibold marker:text-[rgb(var(--app-accent))] first:mt-0 last:mb-0">
          {children}
        </ol>
      ),
      li: ({ children }) => <li className="leading-relaxed">{children}</li>,
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-l-2 border-[rgb(var(--app-border-strong))] pl-3 text-[rgb(var(--app-text-muted))]">
          {children}
        </blockquote>
      ),
      table: ({ children }) => (
        <div className="my-2 overflow-x-auto rounded-lg border border-[rgb(var(--app-border))]">
          <table className="min-w-full border-collapse text-left text-xs">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 font-semibold text-[rgb(var(--app-text))]">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border-t border-[rgb(var(--app-border))] px-3 py-2 text-[rgb(var(--app-text-muted))]">
          {children}
        </td>
      ),
      code: ({ className, children }) => {
        const language = className?.match(/language-(\S+)/)?.[1];
        const code = childrenToText(children);
        if (language || code.includes("\n")) {
          return <CodeBlock code={code.replace(/\n$/, "")} language={language} />;
        }
        return (
          <code className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 font-mono text-[0.86em] text-[rgb(var(--app-text))]">
            {children}
          </code>
        );
      },
      pre: ({ children }) => <>{children}</>,
    }),
    [],
  );

  return (
    <div className="conversation-markdown text-sm leading-relaxed text-[rgb(var(--app-text))]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {renderableMarkdown}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({
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
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [theme, setTheme] = useState(() => currentAppTheme());
  const visibleCode = expanded ? code : collapseCode(code);
  const normalizedLanguage = normalizeCodeLanguage(language);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const target = document.documentElement;
    const observer = new MutationObserver(() => setTheme(currentAppTheme()));
    observer.observe(target, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHighlightedHtml(null);
    if (!visibleCode.trim()) return;
    void import("shiki")
      .then(({ codeToHtml }) =>
        codeToHtml(visibleCode, {
          lang: normalizedLanguage,
          theme: theme === "light" ? "github-light" : "github-dark",
        }),
      )
      .then((html) => {
        if (!cancelled) setHighlightedHtml(html);
      })
      .catch(() => {
        if (!cancelled) setHighlightedHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedLanguage, theme, visibleCode]);

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
      {highlightedHtml ? (
        <div
          className="conversation-code-highlight max-h-80 overflow-auto text-xs leading-relaxed [&_code]:!font-mono [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!px-3 [&_pre]:!py-2 [&_pre]:!font-mono [&_pre]:!leading-relaxed"
          // Shiki escapes source code and emits trusted span markup for highlighting.
          dangerouslySetInnerHTML={{ __html: highlightedHtml }}
        />
      ) : (
        <pre className="max-h-80 overflow-auto px-3 py-2 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
          <code>{visibleCode}</code>
        </pre>
      )}
      {!expanded && shouldCollapse && (
        <div className="border-t border-[rgb(var(--app-border))] px-3 py-1.5 text-[11px] text-[rgb(var(--app-text-subtle))]">
          Showing first {COLLAPSED_CODE_LINES} lines. Copy still uses the full block.
        </div>
      )}
    </div>
  );
}

function childrenToText(children: ReactNode): string {
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
    csharp: "c#",
    cs: "c#",
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

function currentAppTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function truncateMiddle(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const head = Math.max(8, Math.floor((maxLength - 1) * 0.58));
  const tail = Math.max(6, maxLength - head - 1);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function stabilizeStreamingMarkdown(markdown: string): string {
  const openFence = findOpenFence(markdown);
  if (!openFence) return markdown;
  const lineBreak = markdown.endsWith("\n") || markdown.endsWith("\r\n") ? "" : "\n";
  return `${markdown}${lineBreak}${openFence.marker.repeat(openFence.length)}`;
}

function findOpenFence(markdown: string): { marker: "`" | "~"; length: number } | null {
  let openFence: { marker: "`" | "~"; length: number } | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!match) continue;

    const fence = match[1] ?? "";
    const rest = match[2] ?? "";
    const marker = fence[0] as "`" | "~";
    if (!openFence) {
      openFence = { marker, length: fence.length };
      continue;
    }

    if (marker === openFence.marker && fence.length >= openFence.length && rest.trim() === "") {
      openFence = null;
    }
  }
  return openFence;
}

function SourceCard({
  label,
  title,
  detail,
  snippet,
  href,
}: {
  label: string;
  title: string;
  detail?: string;
  snippet?: string;
  href?: string;
}) {
  const content = (
    <div className={conversationPartCardClass}>
      <p className="text-[11px] font-medium text-[rgb(var(--app-text-subtle))]">{label}</p>
      <p className="mt-1 font-medium text-[rgb(var(--app-text))]">{title}</p>
      {detail && <p className="mt-0.5 break-all font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">{detail}</p>}
      {snippet && <p className="mt-1 leading-relaxed text-[rgb(var(--app-text-muted))]">{snippet}</p>}
    </div>
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="block transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35">
      {content}
    </a>
  ) : content;
}

function inlineStatePillClass(state: "ready" | "running" | "error"): string {
  if (state === "error") {
    return "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-danger))]";
  }
  if (state === "ready") {
    return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] text-[rgb(var(--app-success))]";
  }
  return "rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 font-mono text-[10px] text-blue-400";
}

function approvalRiskPillClass(level?: string): string {
  if (level === "high") return "rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-danger))]";
  if (level === "low") return "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-success))]";
  return "rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-[rgb(var(--app-warning))]";
}

function statusDotClass(status: "running" | "done" | "error"): string {
  const color = status === "error" ? "bg-red-500" : status === "done" ? "bg-emerald-500" : "bg-blue-500";
  const motion = status === "running" ? " animate-pulse" : "";
  return `mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${color}${motion}`;
}

function partKey(part: ConversationPart, index: number): string {
  if (part.type === "tool_call") return `tool-${part.toolCallId}-${index}`;
  if (part.type === "tool_approval") return `approval-${part.approvalId}-${index}`;
  if (part.type === "source_document") return `source-doc-${part.sourceId}-${index}`;
  if (part.type === "source_url") return `source-url-${part.sourceId}-${index}`;
  if (part.type === "artifact") return `artifact-${part.artifactId}-${index}`;
  if (part.type === "suggested_reply") return `suggested-${part.id}-${index}`;
  return `${part.type}-${index}`;
}

function referenceKey(part: ReferencePart, index: number): string {
  return part.type === "source_url"
    ? `source-url-${part.sourceId}-${index}`
    : `source-doc-${part.sourceId}-${index}`;
}
