import type { ChatEventPayload, ChatUiChunk } from "../../api.js";
import type { ToolCallPartSnapshot } from "../../chatBubbles.js";
import { reduceChatBubbles } from "./chatBubbleReducer.js";
import type { ApprovalRequest, Bubble, WorkflowEventState } from "./chat.types.js";
import type { ChatUiChunkCorrelation } from "./chatUiChunkDispatcher.js";
import { reduceChatEvent } from "./chatEventReducer.js";
import {
  makeToolCallId,
} from "./chatToolStreamState.js";
import { visibleProgressStatusText } from "./chatStatusText.js";
import {
  handleCancelledEvent,
  handleDoneEvent,
  handleErrorEvent,
} from "./chatTerminalStreamState.js";
import {
  statusTextForApprovalResolved,
  statusTextForWorkflowState,
  workflowStateAfterApprovalResolved,
  workflowStateFromApprovalRequired,
  type WorkflowStateUpdate,
} from "./chatWorkflowStreamState.js";
import {
  applyTurnTimelineEvent,
  isTranscriptEvent,
  sealTurnTranscriptExecution,
  upsertTurnStartedTranscript,
} from "./chatTurnTranscript.js";
import { adoptTurnMetrics, markPendingTurnMetric, markTurnMetric } from "./chatTurnMetrics.js";
import { acceptCanonicalTimelineSequence } from "./chatTimelineSequence.js";

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

export interface ChatStreamDispatcherAdapter {
  uiChunkStreamAvailable: () => boolean;
  setUiChunkStreamAvailable: (available: boolean) => void;
  handleUiChunk: (chunk?: ChatUiChunk, correlation?: ChatUiChunkCorrelation) => void;
  setSessionId: (sessionId: string) => void;
  setStatusText: (status: string | null) => void;
  appendAssistantDelta: (delta: string) => void;
  stopStreaming: () => void;
  upsertToolBubble: (snapshot: ToolCallPartSnapshot) => void;
  appendToolOutputDelta: (
    toolName: string | undefined,
    stream: "stdout" | "stderr" | undefined,
    delta: string | undefined,
    toolCallId?: string,
  ) => void;
  updateBubbles: (updater: (prev: Bubble[]) => Bubble[]) => void;
  addBubble: (bubble: Bubble) => void;
  currentSessionId: () => string | null;
  setWorkflowState: (update: WorkflowStateUpdate) => void;
  showApprovalRequest: (approval: ApprovalRequest, turnId?: string) => void;
  finaliseWithResponse: (text: string, meta: Bubble["meta"] | undefined, streamedText?: string) => void;
  setBusy: (busy: boolean) => void;
  clearCancel: () => void;
  refreshHistory: () => void;
  addErrorBubbleOnce: (text: string) => void;
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

  // The daemon continues to send legacy UI chunks while other clients migrate.
  // Once a turn is timeline-aware, those chunks must never create a second
  // assistant/tool transcript beside the canonical one.
  if (ev.turnId && isLegacyPresentationEvent(ev.type)) return;

  if (ev.type === "turn.started") markTurnMetric(ev.turnId, "turn_started");
  if (ev.type === "turn.phase") {
    markTurnMetric(ev.turnId, ev.phase === "context" ? "context_started" : ev.phase === "planning" ? "planner_started" : "sse_flushed");
  }
  if (ev.type === "assistant_delta" || ev.type === "text.delta") markTurnMetric(ev.turnId, "first_text_delta");
  if (ev.type === "turn.completed" || ev.type === "turn.cancelled" || ev.type === "turn.failed") markTurnMetric(ev.turnId, "finished");
  if (ev.type === "ui.chunk") markPendingTurnMetric("sse_flushed");
  const eventReduction = reduceChatEvent(
    { uiChunkStreamAvailable: adapter.uiChunkStreamAvailable() },
    ev,
  );
  if (eventReduction.acceptance.kind === "ignored") {
    adapter.setUiChunkStreamAvailable(eventReduction.nextState.uiChunkStreamAvailable);
    return;
  }

  switch (ev.type) {
    case "ui.chunk":
      adapter.handleUiChunk(ev.uiChunk, ev);
      break;

    case "session":
      if (ev.sessionId) {
        options.onSession?.(ev.sessionId);
        adapter.setSessionId(ev.sessionId);
      }
      break;

    case "turn.started":
      adapter.setStatusText("Working");
      adapter.updateBubbles((prev) => upsertTurnStartedTranscript(prev, ev, uid));
      break;

    case "turn.phase":
      adapter.setStatusText("Thinking");
      break;

    case "turn.plan":
      adaptLegacyStatementToTranscript(adapter, [ev.message, ...(ev.planItems ?? [])].filter(Boolean).join(": "), ev);
      break;

    case "turn.step":
      // Running/completed steps already have a command group as their public
      // evidence. Keep the compact transcript for an actual blocked decision.
      if (ev.stepStatus === "blocked") {
        adaptLegacyStatementToTranscript(adapter, ev.message, ev);
      }
      break;

    case "turn.completed":
    case "turn.cancelled":
    case "turn.failed":
      adapter.stopStreaming();
      adapter.updateBubbles((bubbles) => applyTurnTimelineEvent(bubbles, ev));
      break;

    case "assistant_delta":
      adapter.setStatusText(null);
      adapter.appendAssistantDelta(ev.delta ?? "");
      break;

    case "progress":
      adapter.stopStreaming();
      adapter.setStatusText(visibleProgressStatusText(ev.message));
      break;

    case "tool_start": {
      adapter.setStatusText(`Running ${ev.name}`);
      adapter.stopStreaming();
      const toolName = ev.name ?? "unknown";
      const toolCallId = ev.toolCallId ?? makeToolCallId(toolName, ev.args);
      adapter.upsertToolBubble({
        toolCallId,
        toolName,
        state: "input-available",
        input: ev.args,
      });
      break;
    }

    case "tool_output_delta":
    case "tool.output.delta":
      adapter.appendToolOutputDelta(ev.name, ev.stream, ev.delta, ev.toolCallId);
      break;

    case "tool_end":
      adapter.updateBubbles((prev) => reduceChatBubbles(prev, { type: "tool_end", event: ev }, uid));
      if (options.pendingBubbleId) {
        adapter.updateBubbles((prev) => reduceChatBubbles(prev, {
          type: "mark_pending_done",
          id: options.pendingBubbleId,
        }, uid));
      }
      adapter.setStatusText("Processing");
      break;

    case "confirm_required":
      adapter.stopStreaming();
      adapter.addBubble({
        id: uid(),
        kind: "confirm",
        riskLevel: ev.riskLevel,
        plan: ev.plan,
        sessionId: options.confirmSessionId ?? adapter.currentSessionId() ?? undefined,
        confirmed: null,
      });
      adapter.setStatusText("Waiting for confirmation");
      break;

    case "workflow_state":
      adapter.setWorkflowState(ev.state ?? null);
      if (ev.state?.pendingApproval) adapter.showApprovalRequest(ev.state.pendingApproval, ev.turnId);
      {
        const statusText = statusTextForWorkflowState(ev.state);
        if (statusText !== undefined) adapter.setStatusText(statusText);
      }
      if (ev.state?.pendingApproval) pauseForApproval(adapter);
      break;

    case "approval_required":
      if (ev.approval) {
        adapter.setWorkflowState(workflowStateFromApprovalRequired(ev.approval));
        adapter.showApprovalRequest(ev.approval, ev.turnId);
      }
      adapter.setStatusText("Waiting for approval");
      pauseForApproval(adapter);
      break;

    case "approval_resolved":
      adapter.setWorkflowState(workflowStateAfterApprovalResolved(ev.approved));
      adapter.setStatusText(statusTextForApprovalResolved(ev.approved));
      break;

    case "executing":
      adapter.addBubble({ id: uid(), kind: "system", text: "Executing actions..." });
      adapter.setStatusText("Executing");
      break;

    case "message":
      if (ev.text) {
        adapter.stopStreaming();
        adapter.addBubble({ id: uid(), kind: "assistant", text: ev.text, meta: { timestamp: Date.now() } });
      }
      break;

    case "done":
      handleDoneEvent(ev, adapter, {
        refreshHistoryOnDone: options.refreshHistoryOnDone,
      });
      break;

    case "cancelled":
      handleCancelledEvent(adapter, {
        pendingBubbleId: options.pendingBubbleId,
        makeId: uid,
      });
      break;

    case "error":
      handleErrorEvent(ev, adapter, {
        pendingBubbleId: options.pendingBubbleId,
      });
      break;
  }

  adapter.setUiChunkStreamAvailable(eventReduction.nextState.uiChunkStreamAvailable);
}

function pauseForApproval(adapter: ChatStreamDispatcherAdapter): void {
  adapter.setBusy(false);
  adapter.clearCancel();
}

function updateTurnActivityMarker(event: ChatEventPayload, adapter: ChatStreamDispatcherAdapter): void {
  adapter.updateBubbles((bubbles) => applyTurnTimelineEvent(bubbles, event));
}

function adaptLegacyStatementToTranscript(
  adapter: Pick<ChatStreamDispatcherAdapter, "updateBubbles">,
  detail: string | null | undefined,
  event?: Pick<ChatEventPayload, "turnId" | "sequence" | "emittedAt">,
): void {
  if (!detail?.trim() || !event?.turnId) return;
  adapter.updateBubbles((bubbles) => applyTurnTimelineEvent(bubbles, {
    type: "turn.work.statement",
    turnId: event.turnId,
    sequence: event.sequence,
    emittedAt: event.emittedAt,
    blockId: `legacy-statement-${event.sequence ?? "unknown"}`,
    message: detail,
  }));
}

function isCanonicalTurnTimelineEvent(type: ChatEventPayload["type"]): boolean {
  return type === "turn.started"
    || type === "turn.narrative.delta"
    || type === "turn.waiting"
    || type === "turn.workflow.updated"
    || type === "turn.final.delta"
    || type === "turn.final.completed"
    || isTranscriptEvent(type);
}

function isLegacyPresentationEvent(type: ChatEventPayload["type"]): boolean {
  return type === "ui.chunk"
    || type === "assistant_delta"
    || type === "text.delta"
    || type === "tool_start"
    || type === "tool.started"
    || type === "tool_output_delta"
    || type === "tool.output.delta"
    || type === "tool_end"
    || type === "tool.completed"
    || type === "work_statement"
    || type === "tool_group_start"
    || type === "tool_group_end"
    || type === "final_delta"
    || type === "done"
    || type === "final"
    || type === "progress"
    || type === "error"
    || type === "cancelled";
}

function dispatchCanonicalTurnTimelineEvent(
  ev: ChatEventPayload,
  adapter: ChatStreamDispatcherAdapter,
  options: ChatStreamDispatchOptions,
): void {
  if (ev.type === "turn.started") {
    adoptTurnMetrics(ev.clientTurnId, ev.turnId);
    markTurnMetric(ev.turnId, "turn_started");
    markTurnMetric(ev.turnId, "sse_flushed");
    adapter.setStatusText(null);
    adapter.updateBubbles((bubbles) => upsertTurnStartedTranscript(bubbles, ev, uid));
    return;
  }
  if (ev.type === "turn.narrative.delta" || ev.type === "turn.work.statement") {
    markTurnMetric(ev.turnId, "first_public_work_statement");
    adapter.updateBubbles((bubbles) => applyTurnTimelineEvent(bubbles, ev));
    return;
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
    adapter.setWorkflowState((ev.workflow ?? ev.state ?? null) as WorkflowStateUpdate);
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
    adapter.setUiChunkStreamAvailable(false);
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
  if (!event.result) return { timestamp };
  return {
    riskLevel: event.result.riskLevel,
    finalizationMode: event.result.finalizationMode,
    actionsTaken: event.result.actionsTaken,
    suggestions: event.result.suggestions,
    sources: event.result.sources,
    artifacts: event.result.artifacts,
    timestamp,
  };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}
