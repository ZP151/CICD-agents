import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import type { ChatToolCall, LLMClient } from "./llm.js";
import { CHAT_FINAL_TOOL_NAME, extractVisibleStreamingResponse } from "./chatPlannerControl.js";
import type { ChatEvent } from "./chatPlannerTypes.js";

export interface PlannerStepStreamResult {
  accumulated: string;
  emittedVisibleResponse: string;
  toolFromStream: ChatToolCall[];
}

export async function* collectPlannerStepStream(
  llm: LLMClient,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  initialEmittedVisibleResponse = "",
): AsyncGenerator<ChatEvent, PlannerStepStreamResult> {
  let accumulated = "";
  let emittedVisibleResponse = initialEmittedVisibleResponse;
  let toolFromStream: ChatToolCall[] = [];

  for await (const ev of llm.chatStream({ messages, tools, maxTokens: 2000 })) {
    if (ev.type === "delta" && ev.delta) {
      accumulated += ev.delta;
      const visibleResponse = dedupeVisibleResponse(
        extractVisibleStreamingResponse(accumulated),
        emittedVisibleResponse,
      );
      if (visibleResponse && visibleResponse.length > emittedVisibleResponse.length) {
        const delta = visibleResponse.slice(emittedVisibleResponse.length);
        emittedVisibleResponse = visibleResponse;
        yield { type: "assistant_delta", delta };
      }
    } else if (ev.type === "tool_call_delta" && ev.toolCalls) {
      const finalizationCall = ev.toolCalls.find((tc) => tc.name === CHAT_FINAL_TOOL_NAME);
      if (finalizationCall?.arguments && !accumulated.trim()) {
        const visibleResponse = dedupeVisibleResponse(
          extractVisibleStreamingResponse(finalizationCall.arguments),
          emittedVisibleResponse,
        );
        if (visibleResponse && visibleResponse.length > emittedVisibleResponse.length) {
          const delta = visibleResponse.slice(emittedVisibleResponse.length);
          emittedVisibleResponse = visibleResponse;
          yield { type: "assistant_delta", delta };
        }
      }
    } else if (ev.type === "tool_call" && ev.toolCalls) {
      toolFromStream = ev.toolCalls;
    }
  }

  return { accumulated, emittedVisibleResponse, toolFromStream };
}

function dedupeVisibleResponse(visibleResponse: string, emittedVisibleResponse: string): string {
  if (!visibleResponse || !emittedVisibleResponse) return visibleResponse;
  if (!visibleResponse.startsWith(emittedVisibleResponse)) return visibleResponse;

  const suffix = visibleResponse.slice(emittedVisibleResponse.length);
  if (!suffix) return visibleResponse;
  if (emittedVisibleResponse.startsWith(suffix)) return emittedVisibleResponse;
  if (suffix.startsWith(emittedVisibleResponse)) {
    return `${emittedVisibleResponse}${suffix.slice(emittedVisibleResponse.length)}`;
  }
  return visibleResponse;
}
