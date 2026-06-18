import type { ConversationPart } from "../../chatBubbles.js";
import type { ReferencePart } from "./ReferenceParts.js";

export type RenderItem =
  | { type: "part"; part: ConversationPart; inlineSources?: ReferencePart[] }
  | { type: "references"; sources: ReferencePart[] };

export function groupReferenceParts(parts: ConversationPart[]): RenderItem[] {
  const items: RenderItem[] = [];
  let pendingSources: ReferencePart[] = [];

  const attachSources = (sources: ReferencePart[]): void => {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      if (item?.type !== "part" || !partAcceptsInlineSources(item.part)) continue;
      items[index] = {
        ...item,
        inlineSources: [...(item.inlineSources ?? []), ...sources],
      };
      return;
    }
    items.push({ type: "references", sources });
  };

  const flush = (): void => {
    if (!pendingSources.length) return;
    attachSources(pendingSources);
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

export function partKey(part: ConversationPart, index: number): string {
  if (part.type === "tool_call") return `tool-${part.toolCallId}-${index}`;
  if (part.type === "tool_approval") return `approval-${part.approvalId}-${index}`;
  if (part.type === "source_document") return `source-doc-${part.sourceId}-${index}`;
  if (part.type === "source_url") return `source-url-${part.sourceId}-${index}`;
  if (part.type === "artifact") return `artifact-${part.artifactId}-${index}`;
  if (part.type === "suggested_reply") return `suggested-${part.id}-${index}`;
  return `${part.type}-${index}`;
}

function partAcceptsInlineSources(part: ConversationPart): boolean {
  return part.type === "text" || part.type === "markdown";
}
