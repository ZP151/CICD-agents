export interface AssistantBubbleMeta {
  riskLevel?: string;
  actionsTaken?: string[];
  suggestions?: string[];
  timestamp?: number;
}

export interface ChatBubbleModel {
  id: string;
  kind: string;
  text?: string;
  streaming?: boolean;
  meta?: AssistantBubbleMeta;
  pendingStatus?: string;
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
  if (
    last?.kind === "assistant" &&
    last.streaming &&
    streamedText &&
    (last.text ?? "").trim() === streamedText.trim()
  ) {
    result[result.length - 1] = { ...last, streaming: false, meta };
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
