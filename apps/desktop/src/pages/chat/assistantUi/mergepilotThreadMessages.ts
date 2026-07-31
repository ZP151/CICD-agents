import type { ThreadMessageLike } from "@assistant-ui/react";
import type { ConversationPart } from "../../../chatBubbleTypes.js";
import type { Bubble } from "../chat.types.js";

/**
 * The boundary between the existing MergePilot event transcript and
 * assistant-ui's framework-neutral message representation.
 *
 * Keep product-specific evidence in `metadata.custom.mergepilot`. The future
 * assistant-ui renderers can use that evidence without asking the daemon to
 * change its SSE contract.
 */
export const toAssistantUiThreadMessages = (
  bubbles: readonly Bubble[],
): ThreadMessageLike[] => bubbles.map(toAssistantUiThreadMessage);

export const toAssistantUiThreadMessage = (
  bubble: Bubble,
): ThreadMessageLike => {
  const metadata = { custom: { mergepilot: metadataFor(bubble) } };

  switch (bubble.kind) {
    case "user":
      return {
        id: bubble.id,
        role: "user",
        content: messageText(bubble),
        metadata,
      };
    case "tool":
      return {
        id: bubble.id,
        role: "assistant",
        content: [toolCallPart(bubble)],
        metadata,
      };
    case "pending_confirm":
      return {
        id: bubble.id,
        role: "assistant",
        content: [
          {
            ...toolCallPart(bubble),
            approval: {
              id: bubble.id,
              options: [
                { id: "approve", kind: "allow-once", label: "Approve and run" },
                { id: "skip", kind: "reject-once", label: "Skip action" },
              ],
            },
          },
        ],
        metadata,
      };
    case "system":
      return {
        id: bubble.id,
        role: "system",
        content: messageText(bubble),
        metadata,
      };
    default:
      return {
        id: bubble.id,
        role: "assistant",
        content: messageText(bubble),
        metadata,
      };
  }
};

const toolCallPart = (bubble: Bubble) => ({
  type: "tool-call" as const,
  toolCallId: bubble.toolCallId ?? bubble.id,
  toolName: bubble.toolName ?? bubble.pendingTool ?? "mergepilot_action",
  argsText: JSON.stringify(bubble.toolArgs ?? bubble.pendingArgs ?? {}),
  result: bubble.toolResult ?? bubble.toolSummary,
  isError: bubble.toolOk === false || bubble.kind === "error",
});

const messageText = (bubble: Bubble): string => {
  if (bubble.text?.trim()) return bubble.text;

  const partText = bubble.parts
    ?.map(partToText)
    .filter((value): value is string => Boolean(value?.trim()))
    .join("\n\n");

  return partText || bubble.toolSummary || bubble.pendingDescription || "";
};

const partToText = (part: ConversationPart): string | undefined => {
  switch (part.type) {
    case "text":
      return part.text;
    case "markdown":
      return part.markdown;
    case "code":
      return `\`\`\`${part.language ?? "text"}\n${part.code}\n\`\`\``;
    case "process_step":
      return part.detail ? `${part.label}: ${part.detail}` : part.label;
    default:
      return undefined;
  }
};

const metadataFor = (bubble: Bubble) => ({
  id: bubble.id,
  kind: bubble.kind,
  parts: bubble.parts,
  streaming: bubble.streaming,
  riskLevel: bubble.riskLevel,
  tool: bubble.toolName ?? bubble.pendingTool,
  toolArgs: bubble.toolArgs ?? bubble.pendingArgs,
  toolSummary: bubble.toolSummary,
  pendingDescription: bubble.pendingDescription,
  pendingNextHint: bubble.pendingNextHint,
  pendingStatus: bubble.pendingStatus,
  pendingWorkflow: bubble.pendingWorkflow,
  pendingReadiness: bubble.pendingReadiness,
  pendingPreflight: bubble.pendingPreflight,
  meta: bubble.meta,
});
