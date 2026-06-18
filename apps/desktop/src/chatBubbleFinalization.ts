import { mergeAssistantBubbleMeta } from "./chatBubbleMeta.js";
import {
  conversationPartsFromAssistantBubble,
  conversationTextFromParts,
} from "./conversationParts.js";
import type { AssistantBubbleMeta, ChatBubbleModel } from "./chatBubbleTypes.js";

export function finaliseAssistantResponseBubbles<T extends ChatBubbleModel>(
  prev: T[],
  cleanText: string,
  meta: AssistantBubbleMeta | undefined,
  streamedText: string | undefined,
  createAssistantBubble: (text: string, meta?: AssistantBubbleMeta) => T,
): T[] {
  const result: T[] = [...prev];
  const last = result[result.length - 1];
  const finalText = sanitizeAssistantText(cleanText);
  const streamText = sanitizeAssistantText(streamedText);
  const finalCandidates = [streamText, finalText].map(normalizeAssistantText).filter(Boolean);

  const matchingAssistantIndex = findMatchingAssistantBubbleIndex(result, finalCandidates);
  if (matchingAssistantIndex >= 0) {
    const bubble = result[matchingAssistantIndex]!;
    const mergedMeta = mergeAssistantBubbleMeta(bubble.meta, meta);
    const partText = conversationTextFromParts(bubble.parts);
    const text =
      finalText ||
      streamText ||
      sanitizeAssistantText(bubble.text) ||
      sanitizeAssistantText(partText);
    const parts = finalText
      ? conversationPartsFromAssistantBubble({ text, meta: mergedMeta })
      : conversationPartsFromAssistantBubble({
          text: bubble.text,
          parts: bubble.parts,
          meta: mergedMeta,
        });
    result[matchingAssistantIndex] = {
      ...bubble,
      text,
      streaming: false,
      meta: mergedMeta,
      parts,
    };
    return result;
  }

  const latestTurnAssistantIndex = findLatestAssistantAfterLastUser(result);
  if (latestTurnAssistantIndex >= 0 && finalText) {
    const bubble = result[latestTurnAssistantIndex]!;
    const mergedMeta = mergeAssistantBubbleMeta(bubble.meta, meta);
    result[latestTurnAssistantIndex] = {
      ...bubble,
      text: finalText,
      streaming: false,
      meta: mergedMeta,
      parts: conversationPartsFromAssistantBubble({ text: finalText, meta: mergedMeta }),
    };
    return result;
  }

  const hasWaitingCard = last?.kind === "pending_confirm" && last.pendingStatus === "waiting";
  if (cleanText && !hasWaitingCard) {
    result.push(createAssistantBubble(finalText || cleanText.trim(), meta));
  }
  return result;
}

function normalizeAssistantText(text: string | undefined): string {
  return sanitizeAssistantText(text).replace(/\r\n/g, "\n").trim();
}

function sanitizeAssistantText(text: string | undefined): string {
  const normalized = (text ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";
  const controlJsonIndex = normalized.search(/\{\s*"?response"?\s*:?/i);
  if (controlJsonIndex > 0) return normalized.slice(0, controlJsonIndex).trim();
  return normalized;
}

function findMatchingAssistantBubbleIndex<T extends ChatBubbleModel>(
  bubbles: T[],
  candidates: string[],
): number {
  if (candidates.length === 0) return -1;
  for (let index = bubbles.length - 1; index >= 0; index -= 1) {
    const bubble = bubbles[index];
    if (bubble?.kind !== "assistant") continue;
    const texts = [bubble.text ?? "", conversationTextFromParts(bubble.parts)]
      .map(normalizeAssistantText)
      .filter(Boolean);
    if (
      candidates.some((candidate) => texts.some((text) => assistantTextMatches(text, candidate)))
    ) {
      return index;
    }
  }
  return -1;
}

function findLatestAssistantAfterLastUser<T extends ChatBubbleModel>(bubbles: T[]): number {
  const lastUserIndex = findLastBubbleIndex(bubbles, (bubble) => bubble.kind === "user");
  for (let index = bubbles.length - 1; index > lastUserIndex; index -= 1) {
    if (bubbles[index]?.kind === "assistant") return index;
  }
  return -1;
}

function findLastBubbleIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index]!)) return index;
  }
  return -1;
}

function assistantTextMatches(current: string, candidate: string): boolean {
  if (current === candidate) return true;
  if (!current || !candidate) return false;
  const longer = current.length >= candidate.length ? current : candidate;
  const shorter = current.length >= candidate.length ? candidate : current;
  if (shorter.length < 40) return false;
  return longer.startsWith(shorter);
}
