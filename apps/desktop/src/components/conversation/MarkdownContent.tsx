import { useMemo } from "react";
import { Streamdown, type Components as StreamdownComponents } from "streamdown";
import { CodeBlock, childrenToText } from "./CodeBlock.js";
import { prepareMarkdownForConversation } from "./markdownSourceLinks.js";
import type { MarkdownContentProps } from "./MarkdownContent.types.js";
import { sourceReferenceTitle, type ReferencePart } from "./ReferenceParts.js";

export function MarkdownContent({
  markdown,
  streaming = false,
  inlineSources = [],
  onSourceSelect,
}: MarkdownContentProps) {
  const sourceById = useMemo(
    () => new Map(inlineSources.map((source) => [source.sourceId, source])),
    [inlineSources],
  );
  const renderableMarkdown = useMemo(
    () => prepareMarkdownForConversation(markdown, inlineSources),
    [markdown, inlineSources],
  );

  const components = useMemo<StreamdownComponents>(
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
      a: ({ children, href }) => {
        const source = sourceFromReferenceHref(href, sourceById);
        if (source) {
          return (
            <button
              type="button"
              className="inline rounded-sm font-semibold text-[rgb(var(--app-accent))] underline decoration-[rgb(var(--app-accent))]/35 decoration-1 underline-offset-2 transition hover:text-blue-400 hover:decoration-blue-400/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--app-accent))]/35"
              data-source-reference-id={source.sourceId}
              title={sourceReferenceTitle(source)}
              onClick={() => onSourceSelect?.(source)}
            >
              {children}
            </button>
          );
        }
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-blue-400 underline decoration-blue-400/40 underline-offset-2 transition hover:text-blue-300"
          >
            {children}
          </a>
        );
      },
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
    [onSourceSelect, sourceById],
  );

  return (
    <div className="conversation-markdown text-sm leading-relaxed text-[rgb(var(--app-text))]" data-streaming={streaming ? "true" : undefined}>
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
        caret={streaming ? "block" : undefined}
        animated={false}
        parseIncompleteMarkdown={streaming}
        normalizeHtmlIndentation
        controls={{ code: { copy: true, download: false }, table: { copy: true, download: false }, mermaid: false }}
        lineNumbers={false}
        components={components}
        className="conversation-streamdown max-w-[72ch]"
        linkSafety={{ enabled: false }}
      >
        {renderableMarkdown}
      </Streamdown>
    </div>
  );
}

function sourceFromReferenceHref(
  href: string | undefined,
  sourceById: Map<string, ReferencePart>,
): ReferencePart | null {
  if (!href?.startsWith("#source-")) return null;
  const sourceId = decodeURIComponent(href.slice("#source-".length));
  return sourceById.get(sourceId) ?? null;
}
