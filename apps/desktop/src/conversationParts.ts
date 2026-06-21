import { mergeAssistantBubbleMeta } from "./chatBubbleMeta.js";
import type {
  AssistantBubbleMeta,
  ChatBubbleModel,
  ConversationArtifactPart,
  ConversationMetadataPart,
  ConversationPart,
  ConversationSourcePart,
} from "./chatBubbleTypes.js";
import {
  sourceLineNumberFromTitle,
  stripSourceLineSuffix,
} from "./components/conversation/sourceTitleUtils.js";

export function conversationPartsFromAssistantBubble(input: {
  text?: string;
  parts?: ConversationPart[];
  meta?: AssistantBubbleMeta;
}): ConversationPart[] {
  if (input.parts?.length) {
    const sourceParts = sourcePartsFromMeta(input.meta);
    const artifactParts = artifactPartsFromMeta(input.meta);
    const metadata = metadataPartFromMeta(input.meta);
    if (!sourceParts.length && !artifactParts.length && !metadata) return input.parts;

    const existingSourceIds = new Set<string>(
      input.parts
        .filter(
          (part): part is ConversationSourcePart =>
            part.type === "source_document" || part.type === "source_url",
        )
        .flatMap((part) => [part.sourceId, sourceIdentityKey(part)]),
    );
    const existingArtifactIds = new Set<string>(
      input.parts
        .filter((part): part is ConversationArtifactPart => part.type === "artifact")
        .map((part) => part.artifactId),
    );
    const next: ConversationPart[] = input.parts.filter((part) => part.type !== "metadata");
    for (const source of sourceParts) {
      if (!existingSourceIds.has(source.sourceId) && !existingSourceIds.has(sourceIdentityKey(source))) next.push(source);
    }
    for (const artifact of artifactParts) {
      if (!existingArtifactIds.has(artifact.artifactId)) next.push(artifact);
    }
    if (metadata) next.push(metadata);
    return next;
  }

  const parts: ConversationPart[] = [];
  if (input.text) parts.push({ type: "markdown", markdown: input.text });
  parts.push(...sourcePartsFromMeta(input.meta));
  parts.push(...artifactPartsFromMeta(input.meta));
  const metadata = metadataPartFromMeta(input.meta);
  if (metadata) parts.push(metadata);
  return parts;
}

export function mergeAssistantMetadataIntoLatestBubble<T extends ChatBubbleModel>(
  prev: T[],
  incoming: AssistantBubbleMeta | undefined,
): T[] {
  if (!incoming) return prev;
  for (let i = prev.length - 1; i >= 0; i--) {
    const bubble = prev[i];
    if (bubble?.kind !== "assistant") continue;
    const meta = mergeAssistantBubbleMeta(bubble.meta, incoming);
    if (!meta) return prev;
    const nextBubble = {
      ...bubble,
      meta,
      parts: conversationPartsFromAssistantBubble({ text: bubble.text, parts: bubble.parts, meta }),
    };
    return [...prev.slice(0, i), nextBubble, ...prev.slice(i + 1)];
  }
  return prev;
}

export function appendTextDeltaToConversationParts(
  parts: ConversationPart[] | undefined,
  delta: string,
): ConversationPart[] {
  if (!delta) return parts ?? [];
  const current = parts?.length ? [...parts] : [];
  const last = current[current.length - 1];
  if (last?.type === "markdown") {
    current[current.length - 1] = { ...last, markdown: `${last.markdown}${delta}` };
    return current;
  }
  if (last?.type === "text") {
    current[current.length - 1] = { ...last, text: `${last.text}${delta}` };
    return current;
  }
  current.push({ type: "markdown", markdown: delta });
  return current;
}

export function conversationTextFromParts(parts: ConversationPart[] | undefined): string {
  return (parts ?? [])
    .map((part) => {
      if (part.type === "markdown") return part.markdown;
      if (part.type === "text") return part.text;
      return "";
    })
    .join("");
}

function metadataPartFromMeta(meta?: AssistantBubbleMeta): ConversationMetadataPart | null {
  if (!meta?.riskLevel && !meta?.actionsTaken?.length && !meta?.suggestions?.length) {
    return null;
  }
  return {
    type: "metadata",
    riskLevel: meta.riskLevel,
    actionsTaken: meta.actionsTaken,
    suggestions: meta.suggestions,
  };
}

function sourcePartsFromMeta(meta?: AssistantBubbleMeta): ConversationSourcePart[] {
  const parts = new Map<string, ConversationSourcePart>();
  for (const [index, source] of (meta?.sources ?? []).entries()) {
    if (source.type === "source_document") {
      const file = source.file?.trim();
      const title = stripSourceLineSuffix(source.title?.trim() ?? "");
      if (!title && !file) continue;
      const key = documentSourceKey(file, title);
      const current = parts.get(key);
      const next: ConversationSourcePart = {
        type: "source_document",
        sourceId: `document-${key || index}`,
        title: title || fileNameFromPath(file) || `Source file ${index + 1}`,
        file,
        line: current?.type === "source_document"
          ? current.line ?? sourceLineNumberFromTitle(source.line, source.title)
          : sourceLineNumberFromTitle(source.line, source.title),
        snippet: mergeSnippetText(
          current?.type === "source_document" ? current.snippet : undefined,
          source.snippet,
        ),
      };
      parts.set(key, next);
      continue;
    }

    const title = source.title?.trim();
    const url = source.url?.trim();
    if (!title || !url) continue;
    parts.set(source.sourceId ?? `url-${index}`, {
      type: "source_url",
      sourceId: source.sourceId ?? `url-${index}`,
      title,
      url,
      domain: source.domain,
      snippet: source.snippet,
    });
  }
  return [...parts.values()];
}

function artifactPartsFromMeta(meta?: AssistantBubbleMeta): ConversationArtifactPart[] {
  return meta?.artifacts ?? [];
}

function sourceIdentityKey(source: ConversationSourcePart): string {
  if (source.type === "source_url") return source.url || source.sourceId;
  return documentSourceKey(source.file, stripSourceLineSuffix(source.title)) || source.sourceId;
}

function documentSourceKey(file: string | undefined, title: string): string {
  return (file || title).replace(/\\/g, "/").trim().toLowerCase();
}

function fileNameFromPath(path: string | undefined): string {
  return path?.split(/[\\/]/).filter(Boolean).pop() ?? "";
}

function mergeSnippetText(current: string | undefined, incoming: string | undefined): string | undefined {
  const snippets = [current, incoming].map((snippet) => snippet?.trim()).filter((snippet): snippet is string => Boolean(snippet));
  return snippets.length ? Array.from(new Set(snippets)).join("\n\n") : undefined;
}
