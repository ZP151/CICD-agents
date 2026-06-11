export interface AssistantBubbleMeta {
  riskLevel?: string;
  finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
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
  const lastAssistantText = last?.kind === "assistant" ? (last.text ?? "").trim() : "";
  const finalText = cleanText.trim();
  const streamText = streamedText?.trim();
  if (
    last?.kind === "assistant" &&
    (last.streaming || !last.meta) &&
    ((streamText && lastAssistantText === streamText) || (finalText && lastAssistantText === finalText))
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
