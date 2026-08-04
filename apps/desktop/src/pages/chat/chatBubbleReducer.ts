import {
  appendVisibleAssistantDeltaTransition,
  finaliseWithResponseTransition,
  showApprovalRequestTransition,
  stopStreamingTransition,
} from "./chatBubbleTransitions.js";
import type { ApprovalRequest, Bubble } from "./chat.types.js";

export type ChatBubbleAction =
  | { type: "add"; bubble: Bubble }
  | { type: "add_many"; bubbles: Bubble[] }
  | {
      type: "finalise_response";
      cleanText: string;
      meta?: Bubble["meta"];
      streamedText?: string;
    }
  | { type: "show_approval"; approval: ApprovalRequest; turnId?: string }
  | { type: "append_visible_assistant_delta"; delta: string }
  | { type: "stop_streaming" }
  | { type: "toggle_tool"; id: string }
  | { type: "resolve_confirm"; id: string; confirmed: boolean }
  | { type: "mark_pending_status"; id: string; status: "executing" | "done" | "cancelled" };

type IdFactory = () => string;

export function reduceChatBubbles(
  prev: Bubble[],
  action: ChatBubbleAction,
  makeId: IdFactory,
): Bubble[] {
  switch (action.type) {
    case "add":
      return [...prev, action.bubble];
    case "add_many":
      return [...prev, ...action.bubbles];
    case "finalise_response":
      return finaliseWithResponseTransition(
        prev,
        action.cleanText,
        action.meta,
        action.streamedText,
        makeId,
      );
    case "show_approval":
      return showApprovalRequestTransition(prev, action.approval, makeId, action.turnId);
    case "append_visible_assistant_delta":
      return appendVisibleAssistantDeltaTransition(prev, action.delta, makeId);
    case "stop_streaming":
      return stopStreamingTransition(prev);
    case "toggle_tool":
      return prev.map((bubble) =>
        bubble.id === action.id ? { ...bubble, toolOpen: !bubble.toolOpen } : bubble,
      );
    case "resolve_confirm":
      return prev.map((bubble) =>
        bubble.id === action.id ? { ...bubble, confirmed: action.confirmed } : bubble,
      );
    case "mark_pending_status":
      if (action.status === "done" || action.status === "cancelled") {
        return prev.filter((bubble) => bubble.id !== action.id);
      }
      return prev.map((bubble) =>
        bubble.id === action.id ? { ...bubble, pendingStatus: action.status } : bubble,
      );
  }
}
