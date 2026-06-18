import type { ChatArtifact } from "../../../api.js";
import {
  conversationPartsFromAssistantBubble,
  type ConversationArtifactPart,
  type ConversationSourcePart,
} from "../../../chatBubbles.js";
import type { Bubble } from "../chat.types.js";

export function collectConversationArtifacts(bubbles: Bubble[]): ConversationArtifactPart[] {
  const artifacts = new Map<string, ConversationArtifactPart>();
  for (const bubble of bubbles) {
    if (bubble.kind !== "assistant") continue;
    for (const part of conversationPartsFromAssistantBubble(bubble)) {
      if (part.type === "artifact") artifacts.set(part.artifactId, part);
    }
  }
  return [...artifacts.values()];
}

export function collectConversationSources(bubbles: Bubble[]): ConversationSourcePart[] {
  const sources = new Map<string, ConversationSourcePart>();
  for (const bubble of bubbles) {
    if (bubble.kind !== "assistant") continue;
    for (const part of conversationPartsFromAssistantBubble(bubble)) {
      if (part.type === "source_document" || part.type === "source_url") {
        const key = sourceReferenceKey(part);
        const current = sources.get(key);
        sources.set(key, current && current.type === "source_document" && part.type === "source_document"
          ? mergeDocumentSource(current, part)
          : part);
      }
    }
  }
  return [...sources.values()].slice(-16);
}

export function sourceReferenceKey(source: ConversationSourcePart): string {
  if (source.type === "source_document") {
    return (source.file || stripSourceLineSuffix(source.title) || source.sourceId).replace(/\\/g, "/").trim().toLowerCase();
  }
  return [source.sourceId, source.url, source.title ?? ""].filter(Boolean).join(":");
}

export function latestRepositoryContextSources(bubbles: Bubble[]): string[] {
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const bubble = bubbles[i]!;
    if (bubble.kind !== "assistant") continue;
    const suggestions = bubble.meta?.suggestions ?? [];
    const contextSources = suggestions
      .filter((source) => source.startsWith("Repository context: "))
      .map((source) => source.replace(/^Repository context:\s*/, "").trim())
      .filter(Boolean);
    if (contextSources.length) return Array.from(new Set(contextSources));
  }
  return [];
}

export function workflowActionArtifactsFromResult(artifacts: ChatArtifact[] | undefined): ConversationArtifactPart[] {
  return (artifacts ?? []).map((artifact) => ({
    type: "artifact",
    artifactId: artifact.artifactId,
    title: artifact.title,
    artifactType: artifact.artifactType,
    status: artifact.status,
    content: artifact.content,
  }));
}

function mergeDocumentSource(
  current: Extract<ConversationSourcePart, { type: "source_document" }>,
  incoming: Extract<ConversationSourcePart, { type: "source_document" }>,
): Extract<ConversationSourcePart, { type: "source_document" }> {
  return {
    ...current,
    title: stripSourceLineSuffix(current.title) || stripSourceLineSuffix(incoming.title),
    file: current.file ?? incoming.file,
    line: undefined,
    snippet: mergeSnippetText(current.snippet, incoming.snippet),
  };
}

function stripSourceLineSuffix(title: string): string {
  return title.replace(/:(?:line\s*)?\d+$/i, "").trim();
}

function mergeSnippetText(current: string | undefined, incoming: string | undefined): string | undefined {
  const snippets = [current, incoming].map((snippet) => snippet?.trim()).filter((snippet): snippet is string => Boolean(snippet));
  return snippets.length ? Array.from(new Set(snippets)).join("\n\n") : undefined;
}
