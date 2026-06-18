import type { ReferencePart } from "./ReferenceParts.js";

interface SourceLinkTerm {
  source: ReferencePart;
  term: string;
  caseSensitive: boolean;
}

export function prepareMarkdownForConversation(markdown: string, sources: ReferencePart[]): string {
  return stabilizeStreamingMarkdown(injectSourceLinksIntoMarkdown(markdown, sources));
}

function injectSourceLinksIntoMarkdown(markdown: string, sources: ReferencePart[]): string {
  const terms = sourceLinkTerms(sources);
  if (!terms.length) return markdown;

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let fenced = false;
  return lines.map((line) => {
    const trimmed = line.trim();
    if (/^(```|~~~)/.test(trimmed)) {
      fenced = !fenced;
      return line;
    }
    if (fenced) return line;
    return linkInlineSourceMentions(line, terms);
  }).join("\n");
}

function sourceLinkTerms(sources: ReferencePart[]): SourceLinkTerm[] {
  const seen = new Set<string>();
  const terms: SourceLinkTerm[] = [];

  for (const source of sources) {
    for (const candidate of sourceTermCandidates(source)) {
      const term = candidate.trim();
      if (!isUsableSourceTerm(term)) continue;
      const key = `${source.sourceId}:${term}`;
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push({
        source,
        term,
        caseSensitive: !term.includes("."),
      });
    }
  }

  return terms.sort((left, right) => right.term.length - left.term.length);
}

function sourceTermCandidates(source: ReferencePart): string[] {
  if (source.type === "source_url") {
    const domain = source.domain ?? safeUrlDomain(source.url);
    return [source.title, domain].filter((term): term is string => Boolean(term));
  }

  const fileName = basenameFromPath(source.file) || source.title;
  const titleBase = stripSourceLineSuffix(source.title);
  const noExtension = fileName.replace(/\.[^.]+$/, "");
  const titleNoExtension = titleBase.replace(/\.[^.]+$/, "");
  return [fileName, titleBase, noExtension, titleNoExtension, source.file].filter((term): term is string => Boolean(term));
}

function safeUrlDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isUsableSourceTerm(term: string): boolean {
  if (term.length < 4 || term.length > 80) return false;
  if (/^[\d:.-]+$/.test(term)) return false;
  return !term.includes("\\") && !term.includes("/");
}

function linkInlineSourceMentions(line: string, terms: SourceLinkTerm[]): string {
  const segments = line.split(/(`[^`]*`)/g);
  return segments.map((segment) => {
    if (segment.startsWith("`") && segment.endsWith("`")) return segment;
    return linkPlainTextSourceMentions(segment, terms);
  }).join("");
}

function linkPlainTextSourceMentions(text: string, terms: SourceLinkTerm[]): string {
  let output = "";
  let index = 0;

  while (index < text.length) {
    const existingLinkEnd = existingMarkdownLinkEnd(text, index);
    if (existingLinkEnd > index) {
      output += text.slice(index, existingLinkEnd);
      index = existingLinkEnd;
      continue;
    }

    const match = terms.find((term) => sourceTermMatchesAt(text, index, term));
    if (match) {
      const label = text.slice(index, index + match.term.length);
      output += `[${label}](#source-${encodeURIComponent(match.source.sourceId)})`;
      index += match.term.length;
      continue;
    }

    output += text[index];
    index += 1;
  }

  return output;
}

function existingMarkdownLinkEnd(text: string, index: number): number {
  if (text[index] !== "[") return index;
  const labelEnd = text.indexOf("](", index);
  if (labelEnd < 0) return index;
  const hrefEnd = text.indexOf(")", labelEnd + 2);
  return hrefEnd < 0 ? index : hrefEnd + 1;
}

function sourceTermMatchesAt(text: string, index: number, term: SourceLinkTerm): boolean {
  const slice = text.slice(index, index + term.term.length);
  const matches = term.caseSensitive ? slice === term.term : slice.toLowerCase() === term.term.toLowerCase();
  if (!matches) return false;
  return isSourceBoundary(text[index - 1]) && isSourceBoundary(text[index + term.term.length]);
}

function isSourceBoundary(char: string | undefined): boolean {
  return !char || /[\s()[\]{}<>,:;'"`*_]/.test(char);
}

function basenameFromPath(path: string | undefined): string {
  return path?.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

function stripSourceLineSuffix(title: string): string {
  return title.replace(/:(?:line\s*)?\d+$/i, "").trim();
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
