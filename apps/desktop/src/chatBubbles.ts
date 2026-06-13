export interface AssistantBubbleMeta {
  riskLevel?: string;
  finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
  actionsTaken?: string[];
  suggestions?: string[];
  sources?: AssistantBubbleSource[];
  artifacts?: ConversationArtifactPart[];
  timestamp?: number;
}

export type AssistantBubbleSource =
  | {
      type: "source_document";
      sourceId?: string;
      title: string;
      file?: string;
      line?: number;
      snippet?: string;
    }
  | {
      type: "source_url";
      sourceId?: string;
      title: string;
      url: string;
      domain?: string;
      snippet?: string;
    };

export type ConversationPart =
  | { type: "text"; text: string }
  | { type: "markdown"; markdown: string }
  | { type: "code"; language?: string; code: string; title?: string; fileName?: string }
  | {
      type: "tool_call";
      toolCallId: string;
      toolName: string;
      state: "input-streaming" | "input-available" | "running" | "result" | "error";
      input?: unknown;
      output?: unknown;
      summary?: string;
    }
  | {
      type: "tool_approval";
      approvalId: string;
      toolName: string;
      description: string;
      args: Record<string, unknown>;
      riskLevel: "low" | "medium" | "high";
    }
  | { type: "source_document"; sourceId: string; title: string; file?: string; line?: number; snippet?: string }
  | { type: "source_url"; sourceId: string; title: string; url: string; domain?: string; snippet?: string }
  | { type: "file"; fileName: string; mediaType?: string; url?: string; localPath?: string }
  | {
      type: "artifact";
      artifactId: string;
      title: string;
      artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
      status: "streaming" | "ready" | "error";
      content?: string;
    }
  | { type: "process_step"; status: "running" | "done" | "error"; label: string; detail?: string }
  | { type: "suggested_reply"; id: string; label: string; message: string }
  | { type: "metadata"; riskLevel?: string; actionsTaken?: string[]; suggestions?: string[] };

export type ConversationToolCallPart = Extract<ConversationPart, { type: "tool_call" }>;
export type ConversationToolApprovalPart = Extract<ConversationPart, { type: "tool_approval" }>;
export type ConversationSourcePart = Extract<ConversationPart, { type: "source_document" | "source_url" }>;
export type ConversationMetadataPart = Extract<ConversationPart, { type: "metadata" }>;
export type ConversationArtifactPart = Extract<ConversationPart, { type: "artifact" }>;

export interface ToolCallPartSnapshot {
  toolCallId: string;
  toolName: string;
  state?: ConversationToolCallPart["state"];
  input?: unknown;
  output?: unknown;
  summary?: string;
}

export interface ToolApprovalPartSnapshot {
  approvalId: string;
  toolName: string;
  description: string;
  args?: Record<string, unknown>;
  riskLevel?: string;
}

export interface ChatBubbleModel {
  id: string;
  kind: string;
  text?: string;
  parts?: ConversationPart[];
  streaming?: boolean;
  meta?: AssistantBubbleMeta;
  pendingStatus?: string;
}

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
        .filter((part): part is ConversationSourcePart => part.type === "source_document" || part.type === "source_url")
        .map((part) => part.sourceId),
    );
    const existingArtifactIds = new Set<string>(
      input.parts
        .filter((part): part is ConversationArtifactPart => part.type === "artifact")
        .map((part) => part.artifactId),
    );
    const next: ConversationPart[] = input.parts.filter((part) => part.type !== "metadata");
    for (const source of sourceParts) {
      if (!existingSourceIds.has(source.sourceId)) next.push(source);
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

export function assistantBubbleMetaFromUnknown(value: unknown): AssistantBubbleMeta | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const riskLevel = optionalString(record["riskLevel"] ?? record["risk_level"]);
  const finalizationMode = optionalFinalizationMode(record["finalizationMode"] ?? record["finalization_mode"]);
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

export function toolCallPartFromSnapshot(snapshot: ToolCallPartSnapshot): ConversationToolCallPart {
  return {
    type: "tool_call",
    toolCallId: snapshot.toolCallId,
    toolName: snapshot.toolName,
    state: snapshot.state ?? inferToolCallState(snapshot),
    input: snapshot.input,
    output: snapshot.output,
    summary: snapshot.summary,
  };
}

export function upsertToolCallPart(
  parts: ConversationPart[] | undefined,
  snapshot: ToolCallPartSnapshot,
): ConversationPart[] {
  const nextPart = toolCallPartFromSnapshot(snapshot);
  const current = parts?.length ? [...parts] : [];
  const index = current.findIndex((part) => part.type === "tool_call" && part.toolCallId === snapshot.toolCallId);
  if (index === -1) return [...current, nextPart];
  current[index] = nextPart;
  return current;
}

export function appendToolOutputDeltaToConversationParts(
  parts: ConversationPart[] | undefined,
  snapshot: ToolCallPartSnapshot,
  stream: "stdout" | "stderr" | undefined,
  delta: string,
): ConversationPart[] {
  if (!delta) return parts ?? [];
  const existing = parts?.find(
    (part): part is ConversationToolCallPart =>
      part.type === "tool_call" && part.toolCallId === snapshot.toolCallId,
  );
  const existingOutput =
    existing?.output && typeof existing.output === "object"
      ? (existing.output as Record<string, unknown>)
      : {};
  const key = stream === "stderr" ? "stderr" : "stdout";
  const output = {
    ...existingOutput,
    [key]: `${String(existingOutput[key] ?? "")}${delta}`.slice(-12000),
  };
  return upsertToolCallPart(parts, {
    ...snapshot,
    state: "running",
    input: snapshot.input ?? existing?.input,
    output,
    summary: snapshot.summary ?? existing?.summary,
  });
}

export function toolApprovalPartFromSnapshot(snapshot: ToolApprovalPartSnapshot): ConversationToolApprovalPart {
  return {
    type: "tool_approval",
    approvalId: snapshot.approvalId,
    toolName: snapshot.toolName,
    description: snapshot.description,
    args: snapshot.args ?? {},
    riskLevel: normalizeRiskLevel(snapshot.riskLevel),
  };
}

export function toolCallPartsFromConversationParts(parts: ConversationPart[] | undefined): ConversationToolCallPart[] {
  return (parts ?? []).filter((part): part is ConversationToolCallPart => part.type === "tool_call");
}

export function primaryToolCallPart(parts: ConversationPart[] | undefined): ConversationToolCallPart | null {
  const toolParts = toolCallPartsFromConversationParts(parts);
  return toolParts[toolParts.length - 1] ?? null;
}

export function groupConsecutiveToolCallParts(parts: ConversationPart[]): Array<
  | { type: "tool_group"; parts: ConversationToolCallPart[] }
  | { type: "part"; part: ConversationPart }
> {
  const groups: Array<
    | { type: "tool_group"; parts: ConversationToolCallPart[] }
    | { type: "part"; part: ConversationPart }
  > = [];

  for (const part of parts) {
    if (part.type !== "tool_call") {
      groups.push({ type: "part", part });
      continue;
    }

    const last = groups[groups.length - 1];
    if (last?.type === "tool_group") {
      last.parts.push(part);
    } else {
      groups.push({ type: "tool_group", parts: [part] });
    }
  }
  return groups;
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
  return (meta?.sources ?? [])
    .map((source, index): ConversationSourcePart | null => {
      if (source.type === "source_document") {
        const title = source.title?.trim();
        if (!title) return null;
        return {
          type: "source_document",
          sourceId: source.sourceId ?? `document-${index}`,
          title,
          file: source.file,
          line: source.line,
          snippet: source.snippet,
        };
      }

      const title = source.title?.trim();
      const url = source.url?.trim();
      if (!title || !url) return null;
      return {
        type: "source_url",
        sourceId: source.sourceId ?? `url-${index}`,
        title,
        url,
        domain: source.domain,
        snippet: source.snippet,
      };
    })
    .filter((part): part is ConversationSourcePart => Boolean(part));
}

function artifactPartsFromMeta(meta?: AssistantBubbleMeta): ConversationArtifactPart[] {
  return meta?.artifacts ?? [];
}

function hasAssistantMeta(meta: AssistantBubbleMeta): boolean {
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

function optionalFinalizationMode(value: unknown): AssistantBubbleMeta["finalizationMode"] | undefined {
  if (value === "agent_final" || value === "control_marker" || value === "plain_json" || value === "none") {
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
        const line = typeof source["line"] === "number" ? source["line"] : undefined;
        return {
          type: "source_document",
          sourceId: optionalString(source["sourceId"] ?? source["source_id"]),
          title,
          file: optionalString(source["file"]),
          line,
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

function assistantBubbleArtifactsFromUnknown(value: unknown): ConversationArtifactPart[] | undefined {
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
    const key = source.type === "source_url"
      ? source.sourceId ?? source.url
      : source.sourceId ?? `${source.file ?? source.title}:${source.line ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }
  return merged.length ? merged : undefined;
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
  return value === "react" || value === "html" || value === "markdown" || value === "mermaid" || value === "text";
}

function isArtifactStatus(value: unknown): value is ConversationArtifactPart["status"] {
  return value === "streaming" || value === "ready" || value === "error";
}

function inferToolCallState(snapshot: ToolCallPartSnapshot): ConversationToolCallPart["state"] {
  if (snapshot.output !== undefined) return "result";
  if (snapshot.input !== undefined) return "input-available";
  return "input-streaming";
}

function normalizeRiskLevel(level?: string): "low" | "medium" | "high" {
  if (level === "high" || level === "medium" || level === "low") return level;
  return "medium";
}

export function finaliseAssistantResponseBubbles<T extends ChatBubbleModel>(
  prev: T[],
  cleanText: string,
  meta: AssistantBubbleMeta | undefined,
  streamedText: string | undefined,
  createAssistantBubble: (text: string, meta?: AssistantBubbleMeta) => T,
): T[] {
  const result: T[] = [...prev];
  const last = result[result.length - 1];
  const finalText = cleanText.trim();
  const streamText = streamedText?.trim();
  const finalCandidates = [streamText, finalText].map(normalizeAssistantText).filter(Boolean);

  const matchingAssistantIndex = findMatchingAssistantBubbleIndex(result, finalCandidates);
  if (matchingAssistantIndex >= 0) {
    const bubble = result[matchingAssistantIndex]!;
    const mergedMeta = mergeAssistantBubbleMeta(bubble.meta, meta);
    const partText = conversationTextFromParts(bubble.parts);
    result[matchingAssistantIndex] = {
      ...bubble,
      text: bubble.text || partText || finalText || streamText,
      streaming: false,
      meta: mergedMeta,
      parts: conversationPartsFromAssistantBubble({ text: bubble.text, parts: bubble.parts, meta: mergedMeta }),
    };
    return result;
  }

  const hasWaitingCard =
    last?.kind === "pending_confirm" &&
    last.pendingStatus === "waiting";
  if (cleanText && !hasWaitingCard) {
    result.push(createAssistantBubble(cleanText, meta));
  }
  return result;
}

function normalizeAssistantText(text: string | undefined): string {
  return (text ?? "").replace(/\r\n/g, "\n").trim();
}

function findMatchingAssistantBubbleIndex<T extends ChatBubbleModel>(bubbles: T[], candidates: string[]): number {
  if (candidates.length === 0) return -1;
  for (let index = bubbles.length - 1; index >= 0; index -= 1) {
    const bubble = bubbles[index];
    if (bubble?.kind !== "assistant") continue;
    const texts = [
      bubble.text ?? "",
      conversationTextFromParts(bubble.parts),
    ].map(normalizeAssistantText).filter(Boolean);
    if (candidates.some((candidate) => texts.includes(candidate))) return index;
  }
  return -1;
}
