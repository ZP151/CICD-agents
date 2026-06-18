import type { ChatEventPayload } from "../../api.js";
import { shouldIgnoreLegacyStreamEvent } from "./chatStreaming.js";

export interface ChatEventReducerState {
  uiChunkStreamAvailable: boolean;
}

export type ChatEventAcceptance =
  | { kind: "accepted"; source: "canonical" | "legacy" | "control" }
  | { kind: "ignored"; reason: "legacy-render-event-after-ui-chunk" };

export interface ChatEventReduction {
  acceptance: ChatEventAcceptance;
  nextState: ChatEventReducerState;
}

const TERMINAL_EVENT_TYPES = new Set(["done", "cancelled", "error", "final"]);
const TERMINAL_UI_CHUNK_TYPES = new Set(["finish", "error"]);

export function reduceChatEvent(
  state: ChatEventReducerState,
  event: ChatEventPayload,
): ChatEventReduction {
  if (event.type === "ui.chunk") {
    const terminal = event.uiChunk ? TERMINAL_UI_CHUNK_TYPES.has(event.uiChunk.type) : false;
    return {
      acceptance: { kind: "accepted", source: "canonical" },
      nextState: { uiChunkStreamAvailable: !terminal },
    };
  }

  if (shouldIgnoreLegacyStreamEvent(event.type, state.uiChunkStreamAvailable)) {
    return {
      acceptance: { kind: "ignored", reason: "legacy-render-event-after-ui-chunk" },
      nextState: state,
    };
  }

  if (TERMINAL_EVENT_TYPES.has(String(event.type))) {
    return {
      acceptance: { kind: "accepted", source: "control" },
      nextState: { uiChunkStreamAvailable: false },
    };
  }

  return {
    acceptance: {
      kind: "accepted",
      source: state.uiChunkStreamAvailable ? "control" : "legacy",
    },
    nextState: state,
  };
}
