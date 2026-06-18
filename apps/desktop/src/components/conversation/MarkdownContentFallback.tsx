import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock.js";
import type { MarkdownContentProps } from "./MarkdownContent.types.js";
import { prepareMarkdownForConversation } from "./markdownSourceLinks.js";
import { sourceReferenceTitle, type ReferencePart } from "./ReferenceParts.js";

type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; language?: string; code: string }
  | { type: "table"; rows: string[][] };

export function MarkdownContentFallback({
  markdown,
  streaming = false,
  inlineSources = [],
  onSourceSelect,
}: MarkdownContentProps) {
  const sourceById = new Map(inlineSources.map((source) => [source.sourceId, source]));
  const renderableMarkdown = prepareMarkdownForConversation(stripUnsafeHtml(markdown), inlineSources);
  const blocks = parseMarkdownBlocks(renderableMarkdown);

  return (
    <div className="conversation-markdown text-sm leading-relaxed text-[rgb(var(--app-text))]" data-streaming={streaming ? "true" : undefined}>
      <div className="conversation-streamdown max-w-[72ch]">
        {blocks.map((block, index) => renderBlock(block, index, sourceById, onSourceSelect))}
      </div>
    </div>
  );
}

function renderBlock(
  block: MarkdownBlock,
  index: number,
  sourceById: Map<string, ReferencePart>,
  onSourceSelect: MarkdownContentProps["onSourceSelect"],
): ReactNode {
  switch (block.type) {
    case "heading": {
      const className = headingClass(block.level);
      const children = renderInline(block.text, sourceById, onSourceSelect);
      if (block.level === 1) return <h1 key={index} className={className}>{children}</h1>;
      if (block.level === 2) return <h2 key={index} className={className}>{children}</h2>;
      return <h3 key={index} className={className}>{children}</h3>;
    }
    case "paragraph":
      return (
        <p key={index} className="my-2 max-w-[72ch] whitespace-pre-wrap leading-relaxed first:mt-0 last:mb-0">
          {renderInline(block.lines.join("\n"), sourceById, onSourceSelect)}
        </p>
      );
    case "ul":
      return (
        <ul key={index} className="my-2 ml-5 list-disc space-y-1.5 marker:text-[rgb(var(--app-accent))] first:mt-0 last:mb-0">
          {block.items.map((item, itemIndex) => <li key={itemIndex} className="leading-relaxed">{renderInline(item, sourceById, onSourceSelect)}</li>)}
        </ul>
      );
    case "ol":
      return (
        <ol key={index} className="my-2 ml-5 list-decimal space-y-1.5 marker:font-semibold marker:text-[rgb(var(--app-accent))] first:mt-0 last:mb-0">
          {block.items.map((item, itemIndex) => <li key={itemIndex} className="leading-relaxed">{renderInline(item, sourceById, onSourceSelect)}</li>)}
        </ol>
      );
    case "code":
      return <CodeBlock key={index} code={block.code} language={block.language} />;
    case "table":
      return (
        <div key={index} className="my-2 overflow-x-auto rounded-lg border border-[rgb(var(--app-border))]">
          <table className="min-w-full border-collapse text-left text-xs">
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => rowIndex === 0
                    ? <th key={cellIndex} className="border-b border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-3 py-2 font-semibold text-[rgb(var(--app-text))]">{renderInline(cell, sourceById, onSourceSelect)}</th>
                    : <td key={cellIndex} className="border-t border-[rgb(var(--app-border))] px-3 py-2 text-[rgb(var(--app-text-muted))]">{renderInline(cell, sourceById, onSourceSelect)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```(\S*)|^~~~(\S*)/);
    if (fence) {
      const marker = line.startsWith("~~~") ? "~~~" : "```";
      const language = fence[1] || fence[2] || undefined;
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? "").startsWith(marker)) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }
      blocks.push({ type: "code", language, code: codeLines.join("\n") });
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1]!.length as 1 | 2 | 3, text: heading[2] ?? "" });
      index += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*[-*]\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index] ?? "")) {
        items.push((lines[index] ?? "").replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (isTableStart(lines, index)) {
      const rows: string[][] = [];
      while (index < lines.length && /^\s*\|/.test(lines[index] ?? "")) {
        if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index] ?? "")) {
          rows.push(splitTableRow(lines[index] ?? ""));
        }
        index += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index]?.trim()) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}

function renderInline(
  text: string,
  sourceById: Map<string, ReferencePart>,
  onSourceSelect: MarkdownContentProps["onSourceSelect"],
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1]) {
      nodes.push(<code key={nodes.length} className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-1.5 py-0.5 font-mono text-[0.86em] text-[rgb(var(--app-text))]">{match[1].slice(1, -1)}</code>);
    } else if (match[2] && match[3]) {
      nodes.push(renderLink(match[2], match[3], nodes.length, sourceById, onSourceSelect));
    } else if (match[4]) {
      nodes.push(<strong key={nodes.length}>{renderInline(match[4], sourceById, onSourceSelect)}</strong>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderLink(
  label: string,
  href: string,
  key: number,
  sourceById: Map<string, ReferencePart>,
  onSourceSelect: MarkdownContentProps["onSourceSelect"],
): ReactNode {
  const source = sourceFromReferenceHref(href, sourceById);
  if (source) {
    return (
      <button key={key} type="button" className="inline rounded-sm font-semibold text-[rgb(var(--app-accent))] underline decoration-[rgb(var(--app-accent))]/35 decoration-1 underline-offset-2" data-source-reference-id={source.sourceId} title={sourceReferenceTitle(source)} onClick={() => onSourceSelect?.(source)}>
        {label}
      </button>
    );
  }
  return <a key={key} href={href} target="_blank" rel="noreferrer" className="text-blue-400 underline decoration-blue-400/40 underline-offset-2 transition hover:text-blue-300">{label}</a>;
}

function sourceFromReferenceHref(href: string, sourceById: Map<string, ReferencePart>): ReferencePart | null {
  if (!href.startsWith("#source-")) return null;
  return sourceById.get(decodeURIComponent(href.slice("#source-".length))) ?? null;
}

function headingClass(level: 1 | 2 | 3): string {
  if (level === 1) return "mb-2 mt-3 text-lg font-semibold leading-tight text-[rgb(var(--app-text))] first:mt-0";
  if (level === 2) return "mb-2 mt-3 text-base font-semibold leading-tight text-[rgb(var(--app-text))] first:mt-0";
  return "mb-1.5 mt-3 text-sm font-semibold leading-tight text-[rgb(var(--app-text))] first:mt-0";
}

function isTableStart(lines: string[], index: number): boolean {
  return /^\s*\|/.test(lines[index] ?? "") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? "");
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function stripUnsafeHtml(markdown: string): string {
  return markdown
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "");
}
