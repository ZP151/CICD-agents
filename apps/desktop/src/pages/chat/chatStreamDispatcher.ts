import type { ChatEventPayload } from "../../api.js";
import type { ApprovalRequest, Bubble, WorkflowEventState } from "./chat.types.js";
import {
  applyTurnTimelineEvent,
  isTranscriptEvent,
  sealTurnTranscriptExecution,
  upsertTurnStartedTranscript,
} from "./chatTurnTranscript.js";
import {
  adoptRequestReceivedMetric,
  adoptTurnMetrics,
  markTurnMetric,
} from "./chatTurnMetrics.js";
import { acceptCanonicalTimelineSequence } from "./chatTimelineSequence.js";
import {
  workflowStateAfterApprovalResolved,
  workflowStateFromApprovalRequired,
  type WorkflowStateUpdate,
} from "./chatWorkflowStreamState.js";

const pendingFinalDeltas = new Map<string, string[]>();
const pendingFinalCompletions = new Map<string, {
  text: string;
  meta: Bubble["meta"] | undefined;
}>();
const pendingFinalTerminals = new Set<string>();
const pendingFinalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const FINAL_PLAYBACK_INTERVAL_MS = 18;

export interface ChatStreamDispatchOptions {
  onSession?: (sessionId: string) => void;
  confirmSessionId?: string | null;
  pendingBubbleId?: string;
  refreshHistoryOnDone?: boolean;
}

/**
 * The live stream is the canonical Timeline protocol only. Legacy render
 * events (ui.chunk, assistant_delta, tool_start, tool_output_delta, tool_end,
 * message, done, error, …) are no longer emitted by the daemon; anything not
 * part of the turn.* protocol is dropped here instead of being rendered a
 * second time beside the transcript. History restore of old sessions stays a
 * migration concern of the session loader, not of the live path.
 */
export interface ChatStreamDispatcherAdapter {
  setSessionId: (sessionId: string) => void;
  setStatusText: (status: string | null) => void;
  appendAssistantDelta: (delta: string) => void;
  stopStreaming: () => void;
  updateBubbles: (updater: (prev: Bubble[]) => Bubble[]) => void;
  addBubble: (bubble: Bubble) => void;
  currentSessionId: () => string | null;
  setWorkflowState: (update: WorkflowStateUpdate) => void;
  showApprovalRequest: (approval: ApprovalRequest, turnId?: string) => void;
  finaliseWithResponse: (text: string, meta: Bubble["meta"] | undefined, streamedText?: string) => void;
  setBusy: (busy: boolean) => void;
  clearCancel: () => void;
  refreshHistory: () => void;
}

export function dispatchChatStreamEvent(
  ev: ChatEventPayload,
  adapter: ChatStreamDispatcherAdapter,
  options: ChatStreamDispatchOptions = {},
): void {
  // Transport-only phases feed diagnostics, not the transcript or a generic
  // status bubble. Public working statements remain the only visible early
  // feedback.
  if (ev.type === "turn.phase" && ev.turnId) {
    markTurnMetric(ev.turnId, ev.phase === "context" ? "context_started" : ev.phase === "planning" ? "planner_started" : "sse_flushed");
    if (ev.phase === "planning") markTurnMetric(ev.turnId, "context_ready");
    return;
  }
  if (isCanonicalTurnTimelineEvent(ev.type)) {
    if (!acceptCanonicalTimelineSequence(adapter, ev)) return;
    dispatchCanonicalTurnTimelineEvent(ev, adapter, options);
    return;
  }

  // Session assignment is the only remaining control event. Every other
  // event type is a legacy live-render event that would create a second
  // assistant/tool transcript beside the canonical one, so it is dropped.
  if (ev.type === "session") {
    if (ev.sessionId) {
      options.onSession?.(ev.sessionId);
      adapter.setSessionId(ev.sessionId);
    }
    return;
  }
}

function pauseForApproval(adapter: ChatStreamDispatcherAdapter): void {
  adapter.setBusy(false);
  adapter.clearCancel();
}

function isCanonicalTurnTimelineEvent(type: ChatEventPayload["type"]): boolean {
  return type === "turn.started"
    || type === "turn.waiting"
    || type === "turn.narrative.delta"
    || type === "turn.workflow.updated"
    || type === "turn.final.delta"
    || type === "turn.final.completed"
    || isTranscriptEvent(type);
}

function dispatchCanonicalTurnTimelineEvent(
  ev: ChatEventPayload,
  adapter: ChatStreamDispatcherAdapter,
  options: ChatStreamDispatchOptions,
): void {
  if (ev.type === "turn.started") {
    adoptTurnMetrics(ev.clientTurnId, ev.turnId);
    adoptRequestReceivedMetric(ev.turnId, ev.requestReceivedAt);
    markTurnMetric(ev.turnId, "turn_started");
    markTurnMetric(ev.turnId, "sse_flushed");
    adapter.setStatusText(null);
    adapter.updateBubbles((bubbles) => upsertTurnStartedTranscript(bubbles, ev, uid));
    return;
  }
  if (ev.type === "turn.waiting") {
    markTurnMetric(ev.turnId, "model_request_started");
    return;
  }
  if (ev.type === "turn.narrative.delta" || ev.type === "turn.work.statement") {
    markTurnMetric(ev.turnId, "first_public_work_statement");
    markTurnMetric(ev.turnId, "first_model_token");
    adapter.updateBubbles((bubbles) => applyTurnTimelineEvent(bubbles, ev));
    return;
  }
  if (ev.type === "turn.tool.started") {
    markTurnMetric(ev.turnId, "first_tool_started");
  }
  if (ev.type === "turn.tool.completed") {
    markTurnMetric(ev.turnId, "first_tool_completed");
  }
  if (ev.type === "turn.approval.requested") {
    adapter.updateBubbles((bubbles) => applyTurnTimelineEvent(bubbles, ev));
    if (ev.approval) {
      adapter.setWorkflowState(workflowStateFromApprovalRequired(ev.approval));
      adapter.showApprovalRequest(ev.approval, ev.turnId);
    }
    pauseForApproval(adapter);
    return;
  }
  if (ev.type === "turn.approval.resolved") {
    adapter.updateBubbles((bubbles) => applyTurnTimelineEvent(bubbles, ev));
    adapter.setWorkflowState(workflowStateAfterApprovalResolved(Boolean(ev.approved)));
    return;
  }
  if (ev.type === "turn.workflow.updated") {
    const workflow = (ev.workflow ?? ev.state ?? null) as WorkflowStateUpdate;
    adapter.setWorkflowState(workflow);
    // Workflow snapshots are public/redacted state projections. In
    // particular, pendingApproval.action.args may be "[omitted]" here. The
    // following turn.approval.requested event is the sole live-render owner
    // because it carries the safe, complete approval payload. Recovery from a
    // persisted workflow snapshot is handled by the session loader, not by
    // this live SSE path.
    return;
  }
  if (ev.type === "turn.final.delta") {
    markTurnMetric(ev.turnId, "first_final_delta");
    // The daemon should always send execution.completed first. Buffer rather
    // than risk rendering a final beside an open Working canvas if a legacy
    // proxy or reconnect delivers a final event early.
    if (ev.turnId) {
      const deltas = pendingFinalDeltas.get(ev.turnId) ?? [];
      deltas.push(ev.delta ?? ev.finalText ?? "");
      pendingFinalDeltas.set(ev.turnId, deltas);
    }
    return;
  }
  if (ev.type === "turn.final.completed") {
    const text = ev.finalText ?? ev.result?.response ?? "";
    adapter.updateBubbles((bubbles) => sealTurnTranscriptExecution(bubbles, ev.turnId, text));
    // A final can finish producing before the turn itself has been persisted
    // and closed. Keep the assistant bubble streaming until turn.finished so
    // Copy and the timestamp cannot appear for an active turn.
    if (ev.turnId && text) {
      pendingFinalCompletions.set(ev.turnId, { text, meta: finalMeta(ev) });
      playFinalDeltas(ev.turnId, adapter);
    }
    return;
  }

  if (ev.type === "turn.execution.completed") {
    // The Working canvas has sealed. The transcript itself now owns the
    // transition; avoid adding a generic status message beside the final.
    adapter.setStatusText(null);
  }
  adapter.updateBubbles((bubbles) => applyTurnTimelineEvent(bubbles, ev));

  if (ev.type === "turn.execution.completed") {
    // Final deltas are intentionally kept outside this branch. They are
    // played only after the execution canvas is sealed, one public chunk per
    // frame, so React never batches a whole conclusion into one paint.
    playFinalDeltas(ev.turnId, adapter);
  }

  if (ev.type === "turn.finished") {
    markTurnMetric(ev.turnId, "finished");
    finishTurnAfterFinalPlayback(ev.turnId, adapter, options);
  }
  if (ev.type === "turn.completed") {
    adapter.stopStreaming();
  }
  if (ev.type === "turn.failed" || ev.type === "turn.cancelled") {
    markTurnMetric(ev.turnId, "finished");
    finishTurnAfterFinalPlayback(ev.turnId, adapter, options);
  }
}

function finishTurnAfterFinalPlayback(
  turnId: string | undefined,
  adapter: ChatStreamDispatcherAdapter,
  options: ChatStreamDispatchOptions,
): void {
  if (!turnId) {
    finishTurnUi(adapter, options);
    return;
  }
  pendingFinalTerminals.add(turnId);
  playFinalDeltas(turnId, adapter, options);
  completeFinalWhenReady(turnId, adapter, options);
}

/**
 * The stream can arrive as a compact burst (for example after a tool-using
 * model has committed its final answer). Preserve its event order while
 * yielding to the browser between public chunks. This is deliberately only a
 * presentation queue: it never invents text or exposes hidden reasoning.
 */
function playFinalDeltas(
  turnId: string | undefined,
  adapter: Pick<ChatStreamDispatcherAdapter, "appendAssistantDelta" | "setStatusText" | "finaliseWithResponse" | "stopStreaming" | "setBusy" | "clearCancel" | "refreshHistory">,
  options: ChatStreamDispatchOptions = {},
): void {
  if (!turnId || pendingFinalTimers.has(turnId)) return;
  const deltas = pendingFinalDeltas.get(turnId);
  if (!deltas?.length) {
    completeFinalWhenReady(turnId, adapter, options);
    return;
  }

  const advance = () => {
    const queue = pendingFinalDeltas.get(turnId);
    const delta = queue?.shift();
    if (delta) {
      adapter.setStatusText(null);
      adapter.appendAssistantDelta(delta);
    }
    if (queue?.length) {
      if (typeof window === "undefined") {
        advance();
        return;
      }
      pendingFinalTimers.set(turnId, setTimeout(advance, FINAL_PLAYBACK_INTERVAL_MS));
      return;
    }
    pendingFinalTimers.delete(turnId);
    pendingFinalDeltas.delete(turnId);
    completeFinalWhenReady(turnId, adapter, options);
  };

  // Node-side reducer tests should retain their synchronous contract. The
  // desktop browser takes the yielding branch below.
  if (typeof window === "undefined") {
    advance();
    return;
  }
  pendingFinalTimers.set(turnId, setTimeout(advance, FINAL_PLAYBACK_INTERVAL_MS));
}

function completeFinalWhenReady(
  turnId: string,
  adapter: Pick<ChatStreamDispatcherAdapter, "finaliseWithResponse" | "stopStreaming" | "setStatusText" | "setBusy" | "clearCancel" | "refreshHistory">,
  options: ChatStreamDispatchOptions = {},
): void {
  if (!pendingFinalTerminals.has(turnId) || pendingFinalTimers.has(turnId) || (pendingFinalDeltas.get(turnId)?.length ?? 0) > 0) return;
  pendingFinalTerminals.delete(turnId);
  const completion = pendingFinalCompletions.get(turnId);
  pendingFinalCompletions.delete(turnId);
  // Drain the visible text animator first. Otherwise a queued tail may be
  // appended after finaliseWithResponse has turned the current assistant
  // bubble non-streaming, which creates a duplicate assistant message.
  adapter.stopStreaming();
  if (completion) adapter.finaliseWithResponse(completion.text, completion.meta, completion.text);
  finishTurnUi(adapter, options);
}

function finishTurnUi(
  adapter: Pick<ChatStreamDispatcherAdapter, "setBusy" | "clearCancel" | "setStatusText" | "refreshHistory">,
  options: ChatStreamDispatchOptions,
): void {
  adapter.setBusy(false);
  adapter.clearCancel();
  adapter.setStatusText(null);
  if (options.refreshHistoryOnDone) adapter.refreshHistory();
}

function finalMeta(event: ChatEventPayload): Bubble["meta"] | undefined {
  const timestamp = event.emittedAt ?? Date.now();
  if (!event.result && !event.evidence) return { timestamp };
  return {
    ...(event.result
      ? {
          riskLevel: event.result.riskLevel,
          finalizationMode: event.result.finalizationMode,
          actionsTaken: event.result.actionsTaken,
          suggestions: event.result.suggestions,
          sources: event.result.sources,
          artifacts: event.result.artifacts,
        }
      : {}),
    ...(event.evidence ? { evidence: event.evidence } : {}),
    timestamp,
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}
