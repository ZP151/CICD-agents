import type { ChatEvent } from "./chatPlannerTypes.js";

export async function* offlineFallbackEvents(message: string): AsyncGenerator<ChatEvent> {
  const requested = summarizeOfflineRequest(message);
  const response =
    `Selected model is temporarily unavailable, so I did not infer or execute a Git/PR workflow.\n\n` +
    `Request: ${requested}\n\n` +
    `Use a structured Conversation action such as Review changes, Branch status, PR insight, ` +
    `or restore the model connection so I can inspect current repository state and choose exact tool arguments.`;
  yield { type: "message", text: response };
  yield {
    type: "done",
    result: {
      response,
      streamedResponse: undefined,
      finalizationMode: "none",
      riskLevel: "low",
      actionsTaken: [],
      suggestions: [
        "Review changes",
        "Check branch status",
        "Restore model connection",
      ],
      toolCallsMade: [],
      usedLlm: false,
    },
  };
}

function summarizeOfflineRequest(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return "No user request was available.";
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}
