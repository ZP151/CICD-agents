import type { ChatEventPayload } from "../../api.js";
import type { ToolCallPartSnapshot } from "../../chatBubbles.js";
import {
  addErrorBubbleOnceTransition,
  appendToolOutputDeltaTransition,
  appendVisibleAssistantDeltaTransition,
  finaliseWithResponseTransition,
  mergeAssistantMetadataTransition,
  showApprovalRequestTransition,
  stopStreamingTransition,
  upsertToolBubbleTransition,
} from "./chatBubbleTransitions.js";
import type { ApprovalRequest, Bubble } from "./chat.types.js";
import {
  markExecutingPendingBubblesDone,
  markPendingBubbleCancelled,
  markPendingBubbleDone,
  updateToolEndBubble,
} from "./chatToolStreamState.js";

export type ChatBubbleAction =
  | { type: "add"; bubble: Bubble }
  | { type: "add_many"; bubbles: Bubble[] }
  | { type: "add_error_once"; message: string }
  | {
      type: "finalise_response";
      cleanText: string;
      meta?: Bubble["meta"];
      streamedText?: string;
    }
  | { type: "show_approval"; approval: ApprovalRequest; turnId?: string }
  | {
      type: "upsert_tool";
      snapshot: ToolCallPartSnapshot;
      options?: {
        ok?: boolean;
        result?: unknown;
        open?: boolean;
        liveOutput?: string;
        turnId?: string;
        sequence?: number;
        timestamp?: number;
        connector?: Bubble["connector"];
      };
    }
  | {
      type: "append_tool_output_delta";
      toolName: string | undefined;
      stream: "stdout" | "stderr" | undefined;
      delta: string | undefined;
      toolCallId?: string;
    }
  | { type: "merge_assistant_metadata"; metadata: unknown }
  | { type: "append_visible_assistant_delta"; delta: string }
  | { type: "stop_streaming" }
  | { type: "toggle_tool"; id: string }
  | { type: "resolve_confirm"; id: string; confirmed: boolean }
  | { type: "mark_pending_status"; id: string; status: "executing" | "done" | "cancelled" }
  | { type: "mark_pending_done"; id?: string }
  | { type: "mark_pending_cancelled"; id?: string }
  | { type: "mark_executing_pending_done" }
  | { type: "tool_end"; event: ChatEventPayload };

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
    case "add_error_once":
      return addErrorBubbleOnceTransition(prev, action.message, makeId);
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
    case "upsert_tool":
      return upsertToolBubbleTransition(prev, action.snapshot, action.options ?? {}, makeId);
    case "append_tool_output_delta":
      return appendToolOutputDeltaTransition(
        prev,
        action.toolName,
        action.stream,
        action.delta,
        action.toolCallId,
        makeId,
      );
    case "merge_assistant_metadata":
      return mergeAssistantMetadataTransition(prev, action.metadata);
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
    case "mark_pending_done":
      return markPendingBubbleDone(prev, action.id);
    case "mark_pending_cancelled":
      return markPendingBubbleCancelled(prev, action.id);
    case "mark_executing_pending_done":
      return markExecutingPendingBubblesDone(prev);
    case "tool_end":
      return updateToolEndBubble(prev, action.event);
  }
}
