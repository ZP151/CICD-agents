import type {
  AssistantBubbleMeta,
  AssistantBubbleSource,
  ConversationArtifactPart,
} from "./chatBubbleTypes.js";
import {
  sourceLineNumberFromTitle,
  stripSourceLineSuffix,
} from "./components/conversation/sourceTitleUtils.js";

export function assistantBubbleMetaFromUnknown(value: unknown): AssistantBubbleMeta | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const riskLevel = optionalString(record["riskLevel"] ?? record["risk_level"]);
  const finalizationMode = optionalFinalizationMode(
    record["finalizationMode"] ?? record["finalization_mode"],
  );
  const actionsTaken = optionalStringArray(record["actionsTaken"] ?? record["actions_taken"]);
  const suggestions = optionalStringArray(record["suggestions"]);
  const sources = assistantBubbleSourcesFromUnknown(record["sources"]);
  const artifacts = assistantBubbleArtifactsFromUnknown(record["artifacts"]);
  const timestamp = typeof record["timestamp"] === "number" ? record["timestamp"] : undefined;
  const meta: AssistantBubbleMeta = {
    riskLevel,
    finalizationMode,
    actionsTaken,
    suggestions,
    sources,
    artifacts,
    timestamp,
  };
  return hasAssistantMeta(meta) ? meta : undefined;
}

export function mergeAssistantBubbleMeta(
  current: AssistantBubbleMeta | undefined,
  incoming: AssistantBubbleMeta | undefined,
): AssistantBubbleMeta | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  const merged: AssistantBubbleMeta = {
    ...current,
    ...incoming,
    actionsTaken: mergeStringLists(current.actionsTaken, incoming.actionsTaken),
    suggestions: mergeStringLists(current.suggestions, incoming.suggestions),
    sources: mergeAssistantSources(current.sources, incoming.sources),
    artifacts: mergeAssistantArtifacts(current.artifacts, incoming.artifacts),
  };
  return hasAssistantMeta(merged) ? merged : undefined;
}

export function hasAssistantMeta(meta: AssistantBubbleMeta): boolean {
  return Boolean(
    meta.riskLevel ||
    meta.finalizationMode ||
    meta.actionsTaken?.length ||
    meta.suggestions?.length ||
    meta.sources?.length ||
    meta.artifacts?.length ||
    meta.timestamp,
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.map(optionalString).filter((item): item is string => Boolean(item));
  return out.length ? out : undefined;
}

function optionalFinalizationMode(
  value: unknown,
): AssistantBubbleMeta["finalizationMode"] | undefined {
  if (
    value === "agent_final" ||
    value === "control_marker" ||
    value === "plain_json" ||
    value === "none"
  ) {
    return value;
  }
  return undefined;
}

function assistantBubbleSourcesFromUnknown(value: unknown): AssistantBubbleSource[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sources = value
    .map((item): AssistantBubbleSource | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const type = source["type"];
      const title = optionalString(source["title"]);
      if (type === "source_document") {
        if (!title) return null;
        return {
          type: "source_document",
          sourceId: optionalString(source["sourceId"] ?? source["source_id"]),
          title: stripSourceLineSuffix(title),
          file: optionalString(source["file"]),
          line: undefined,
          snippet: optionalString(source["snippet"]),
        };
      }
      if (type === "source_url") {
        const url = optionalString(source["url"]);
        if (!title || !url) return null;
        return {
          type: "source_url",
          sourceId: optionalString(source["sourceId"] ?? source["source_id"]),
          title,
          url,
          domain: optionalString(source["domain"]),
          snippet: optionalString(source["snippet"]),
        };
      }
      return null;
    })
    .filter((source): source is AssistantBubbleSource => Boolean(source));
  return sources.length ? sources : undefined;
}

function assistantBubbleArtifactsFromUnknown(
  value: unknown,
): ConversationArtifactPart[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const artifacts = value
    .map((item): ConversationArtifactPart | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const artifactId = optionalString(record["artifactId"] ?? record["artifact_id"]);
      const title = optionalString(record["title"]);
      const artifactType = record["artifactType"] ?? record["artifact_type"];
      const status = record["status"];
      if (!artifactId || !title) return null;
      if (!isArtifactType(artifactType) || !isArtifactStatus(status)) return null;
      const content = typeof record["content"] === "string" ? record["content"] : undefined;
      return {
        type: "artifact",
        artifactId,
        title,
        artifactType,
        status,
        content,
      };
    })
    .filter((artifact): artifact is ConversationArtifactPart => Boolean(artifact));
  return artifacts.length ? artifacts : undefined;
}

function mergeStringLists(
  current: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  const merged = [...(current ?? []), ...(incoming ?? [])].filter(Boolean);
  return merged.length ? Array.from(new Set(merged)) : undefined;
}

function mergeAssistantSources(
  current: AssistantBubbleSource[] | undefined,
  incoming: AssistantBubbleSource[] | undefined,
): AssistantBubbleSource[] | undefined {
  const merged: AssistantBubbleSource[] = [];
  const seen = new Set<string>();
  for (const source of [...(current ?? []), ...(incoming ?? [])]) {
    const key =
      source.type === "source_url"
        ? (source.sourceId ?? source.url)
        : documentSourceMergeKey(source);
    const existingIndex = merged.findIndex((item) => (
      item.type === "source_document" && source.type === "source_document"
        ? documentSourceMergeKey(item) === key
        : false
    ));
    if (existingIndex >= 0 && source.type === "source_document") {
      const existing = merged[existingIndex];
      if (existing?.type === "source_document") {
        merged[existingIndex] = mergeDocumentSource(existing, source);
      }
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source.type === "source_document" ? normalizeDocumentSource(source) : source);
  }
  return merged.length ? merged : undefined;
}

function normalizeDocumentSource(
  source: Extract<AssistantBubbleSource, { type: "source_document" }>,
): Extract<AssistantBubbleSource, { type: "source_document" }> {
  return {
    ...source,
    title: stripSourceLineSuffix(source.title),
    line: sourceLineNumberFromTitle(source.line, source.title),
  };
}

function documentSourceMergeKey(source: Extract<AssistantBubbleSource, { type: "source_document" }>): string {
  return normalizeSourcePath(source.file) || stripSourceLineSuffix(source.title).toLowerCase();
}

function mergeDocumentSource(
  current: Extract<AssistantBubbleSource, { type: "source_document" }>,
  incoming: Extract<AssistantBubbleSource, { type: "source_document" }>,
): Extract<AssistantBubbleSource, { type: "source_document" }> {
  return {
    ...current,
    sourceId: current.sourceId ?? incoming.sourceId,
    title: stripSourceLineSuffix(current.title) || stripSourceLineSuffix(incoming.title),
    file: current.file ?? incoming.file,
    line: sourceLineNumberFromTitle(current.line, current.title)
      ?? sourceLineNumberFromTitle(incoming.line, incoming.title),
    snippet: mergeSnippetText(current.snippet, incoming.snippet),
  };
}

function normalizeSourcePath(path: string | undefined): string {
  return path?.replace(/\\/g, "/").trim().toLowerCase() ?? "";
}

function mergeSnippetText(current: string | undefined, incoming: string | undefined): string | undefined {
  const snippets = [current, incoming].map((snippet) => snippet?.trim()).filter((snippet): snippet is string => Boolean(snippet));
  return snippets.length ? Array.from(new Set(snippets)).join("\n\n") : undefined;
}

function mergeAssistantArtifacts(
  current: ConversationArtifactPart[] | undefined,
  incoming: ConversationArtifactPart[] | undefined,
): ConversationArtifactPart[] | undefined {
  const merged: ConversationArtifactPart[] = [];
  const seen = new Set<string>();
  for (const artifact of [...(current ?? []), ...(incoming ?? [])]) {
    if (seen.has(artifact.artifactId)) continue;
    seen.add(artifact.artifactId);
    merged.push(artifact);
  }
  return merged.length ? merged : undefined;
}

function isArtifactType(value: unknown): value is ConversationArtifactPart["artifactType"] {
  return (
    value === "react" ||
    value === "html" ||
    value === "markdown" ||
    value === "mermaid" ||
    value === "text"
  );
}

function isArtifactStatus(value: unknown): value is ConversationArtifactPart["status"] {
  return value === "streaming" || value === "ready" || value === "error";
}
