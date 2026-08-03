import type { FastifyReply } from "fastify";
import {
  createDiagnosticId,
  explainTurnFailure,
  turnFailureRecovery,
  type TurnFailureKind,
} from "@mergepilot/core";
import { redact, type ChatEvent, type TurnTimelineEvent } from "@mergepilot/core";
import { sessionStartedEvent } from "../chatEvents.js";

export interface ChatSseWriter {
  send(event: string, payload: unknown): void;
  startTurn(turnId: string, openingStatement?: string, clientTurnId?: string): void;
  resumeTurn(turnId: string, options: { startedAt?: number; lastSequence?: number; statement?: string }): void;
  /** A network/model diagnostic, intentionally not a persisted narrative part. */
  sendWaitingForModel(): void;
  sendChatEvent(event: ChatEvent): void;
  /** True once startTurn/resumeTurn set an active turn envelope. */
  hasActiveTurn(): boolean;
  end(): void;
}

export function createChatSseWriter(
  reply: FastifyReply,
  sessionId?: string,
  onTimelineEvent?: (event: TurnTimelineEvent) => Promise<void> | void,
): ChatSseWriter {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("Access-Control-Allow-Origin", "*");
  if (sessionId) reply.raw.setHeader("X-Chat-Session-Id", sessionId);
  reply.raw.flushHeaders();

  let timelinePersistence = Promise.resolve();
  let activeTurn: {
    id: string;
    nextSequence: number;
    startedAt: number;
    toolStartedAt: Map<string, number>;
    finalTextDeltas: string[];
    awaitingApproval: boolean;
    hasNarrative: boolean;
    activeToolGroupId?: string;
  } | undefined;

  const send = (event: string, payload: unknown): void => {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const sendTimeline = (event: string, payload: Record<string, unknown>): void => {
    const record = publicTimelinePayload(event, payload);
    timelinePersistence = timelinePersistence
      .then(() => onTimelineEvent?.(record))
      // A transcript persistence failure must not break the live SSE stream.
      .catch(() => undefined);
    send(event, record);
  };
  if (sessionId) {
    for (const sse of sessionStartedEvent(sessionId)) send(sse.event, sse.payload);
  }

  return {
    send,
    hasActiveTurn: () => activeTurn !== undefined,
    startTurn(turnId, openingStatement, clientTurnId) {
      activeTurn = {
        id: turnId,
        nextSequence: 1,
        startedAt: Date.now(),
        toolStartedAt: new Map(),
        finalTextDeltas: [],
        awaitingApproval: false,
        hasNarrative: false,
        activeToolGroupId: undefined,
      };
      sendTimeline("turn.started", {
        type: "turn.started",
        turnId,
        sequence: 0,
        emittedAt: activeTurn.startedAt,
        sessionId,
        clientTurnId,
      });
      if (openingStatement) {
        const base = nextTimelineBase(activeTurn);
        activeTurn.hasNarrative = true;
        sendTimeline("turn.narrative.delta", {
          type: "turn.narrative.delta",
          ...base,
          blockId: "opening",
          message: openingStatement,
          replace: true,
        });
      }
    },
    resumeTurn(turnId, options) {
      const now = Date.now();
      activeTurn = {
        id: turnId,
        nextSequence: Math.max(1, (options.lastSequence ?? 0) + 1),
        startedAt: typeof options.startedAt === "number" && options.startedAt <= now ? options.startedAt : now,
        toolStartedAt: new Map(),
        finalTextDeltas: [],
        awaitingApproval: false,
        hasNarrative: false,
        activeToolGroupId: undefined,
      };
      if (options.statement) {
        const base = nextTimelineBase(activeTurn);
        activeTurn.hasNarrative = true;
        sendTimeline("turn.narrative.delta", {
          type: "turn.narrative.delta",
          ...base,
          blockId: `approval-resume-${base.sequence}`,
          message: options.statement,
        });
      }
    },
    sendWaitingForModel() {
      if (!activeTurn || activeTurn.hasNarrative) return;
      const base = nextTimelineBase(activeTurn);
      // This is an explicit transport state, not a fabricated agent thought.
      // It is deliberately sent directly instead of through sendTimeline so
      // reconnect/history playback cannot turn it into transcript content.
      send("turn.waiting", { type: "turn.waiting", ...base, message: "Waiting for model response…" });
    },
    sendChatEvent(event) {
      const enriched = enrichTurnEvent(event, activeTurn);
      if (enriched.type === "progress") {
        // This event is for performance diagnostics only. It is deliberately
        // not persisted or rendered as a canned status line in the Turn.
        send("turn.phase", {
          type: "turn.phase",
          turnId: (enriched as ChatEvent & { turnId?: string }).turnId,
          sequence: (enriched as ChatEvent & { sequence?: number }).sequence,
          emittedAt: (enriched as ChatEvent & { emittedAt?: number }).emittedAt,
          phase: progressPhase(enriched.message),
        });
      }
      for (const timeline of timelineProjection(enriched, activeTurn)) sendTimeline(timeline.event, timeline.payload);
      // The Timeline is the only live presentation channel. Legacy SSE and
      // ui.chunk projections used to make every event render twice and are
      // now confined to history migration adapters on the desktop.
    },
    end() {
      // Persistence is deliberately fire-and-forget relative to the network
      // response. Waiting for a slow session store here keeps an otherwise
      // complete Turn's SSE connection open, so the desktop never receives a
      // terminal stream boundary (and therefore cannot show the footer).
      // `sendTimeline` already serializes and absorbs persistence failures.
      // Let that chain finish in the background after closing the live stream.
      reply.raw.end();
      void timelinePersistence;
    },
  };
}

function progressPhase(message: string): "context" | "planning" {
  return /planning|plan next step/i.test(message) ? "planning" : "context";
}

function timelineProjection(
  event: ChatEvent,
  turn: { id: string; nextSequence: number; startedAt: number; toolStartedAt: Map<string, number>; finalTextDeltas: string[]; awaitingApproval: boolean; hasNarrative: boolean; activeToolGroupId?: string } | undefined,
): Array<{ event: string; payload: Record<string, unknown> }> {
  const correlated = event as ChatEvent & {
    turnId?: string;
    sequence?: number;
    emittedAt?: number;
    elapsedMs?: number;
  };
  if (!correlated.turnId) return [];
  const base = {
    turnId: correlated.turnId,
    sequence: correlated.sequence,
    emittedAt: correlated.emittedAt,
    elapsedMs: correlated.elapsedMs,
  };
  if (event.type === "assistant_delta") {
    // Final-control arguments stream as normal model text before the planner
    // confirms the terminal result. Keep their real delta boundaries private
    // until execution is sealed; emitting them now would put a final beside an
    // open Working canvas.
    if (event.delta) turn?.finalTextDeltas.push(event.delta);
    return [];
  }
  if (event.type === "progress" || event.type === "turn_phase") return [];
  if (event.type === "work_statement") {
    if (turn) turn.hasNarrative = true;
    return [{ event: "turn.narrative.delta", payload: {
      type: "turn.narrative.delta", ...base, blockId: event.blockId, message: event.text, replace: event.replace,
    } }];
  }
  if (event.type === "tool_group_start") {
    if (turn) turn.activeToolGroupId = event.groupId;
    return [{ event: "turn.tool_group.started", payload: {
      type: "turn.tool_group.started", ...base, groupId: event.groupId, connector: event.connector,
    } }];
  }
  if (event.type === "tool_group_end") {
    if (turn?.activeToolGroupId === event.groupId) turn.activeToolGroupId = undefined;
    return [{ event: "turn.tool_group.completed", payload: {
      type: "turn.tool_group.completed", ...base, groupId: event.groupId,
    } }];
  }
  if (event.type === "approval_required") {
    if (turn) turn.awaitingApproval = true;
    return [{ event: "turn.approval.requested", payload: {
      type: "turn.approval.requested", ...base, approval: event.approval,
      blockId: event.approval.id,
    } }];
  }
  if (event.type === "approval_resolved") {
    if (turn) turn.awaitingApproval = false;
    return [{ event: "turn.approval.resolved", payload: {
      type: "turn.approval.resolved", ...base, approvalId: event.approvalId, approved: event.approved,
    } }];
  }
  if (event.type === "workflow_state") {
    return [{ event: "turn.workflow.updated", payload: {
      type: "turn.workflow.updated", ...base, workflow: event.state,
    } }];
  }
  if (event.type === "turn_plan") {
    if (turn) turn.hasNarrative = true;
    return [{ event: "turn.narrative.delta", payload: {
      type: "turn.narrative.delta", ...base, blockId: `legacy-plan-${correlated.sequence ?? 0}`,
      message: [event.title, ...event.items].filter(Boolean).join(": "),
    } }];
  }
  if (event.type === "tool_start") {
    const commandId = event.toolCallId ?? event.name;
    turn?.toolStartedAt.set(commandId, correlated.emittedAt ?? Date.now());
    return [{ event: "turn.tool.started", payload: {
      type: "turn.tool.started", ...base, groupId: turn?.activeToolGroupId ?? event.toolCallId ?? event.name,
      commandId, toolCallId: event.toolCallId, name: event.name, args: event.args,
    } }];
  }
  if (event.type === "tool_end") {
    const commandId = event.toolCallId ?? event.name;
    const startedAt = turn?.toolStartedAt.get(commandId);
    turn?.toolStartedAt.delete(commandId);
    return [{ event: "turn.tool.completed", payload: {
      type: "turn.tool.completed", ...base, groupId: turn?.activeToolGroupId ?? event.toolCallId ?? event.name,
      commandId, toolCallId: event.toolCallId, name: event.name, ok: event.ok, summary: event.summary,
      output: event.output,
      durationMs: startedAt === undefined ? undefined : Math.max(0, (correlated.emittedAt ?? Date.now()) - startedAt),
    } }];
  }
  if (event.type === "done") {
    if (turn?.awaitingApproval) return [];
    const events: Array<{ event: string; payload: Record<string, unknown> }> = [{
      event: "turn.execution.completed",
      payload: { type: "turn.execution.completed", ...base },
    }];
    for (const delta of finalDeltas(event.result.response, turn?.finalTextDeltas)) {
      const next = nextTimelineBase(turn, base);
      events.push({ event: "turn.final.delta", payload: { type: "turn.final.delta", ...next, delta } });
    }
    const final = nextTimelineBase(turn, base);
    events.push({ event: "turn.final.completed", payload: {
      type: "turn.final.completed", ...final, finalText: event.result.response,
    } });
    const finished = nextTimelineBase(turn, base);
    events.push({ event: "turn.finished", payload: { type: "turn.finished", ...finished, status: "completed" } });
    return events;
  }
  if (event.type === "cancelled" || event.type === "error") {
    const cancelled = event.type === "cancelled";
    const typed = event.failure;
    const failureKind: TurnFailureKind = cancelled
      ? "cancelled_by_user"
      : typed?.kind ?? "internal";
    const summary = cancelled
      ? explainTurnFailure("cancelled_by_user")
      : typed
        ? explainTurnFailure(typed.kind, typed.diagnosticId)
        : `I could not complete this turn: ${event.message || "an unexpected error occurred"}. Please adjust the request or try again.`;
    const finalDelta = nextTimelineBase(turn, base);
    const finalCompleted = nextTimelineBase(turn, base);
    const terminal = nextTimelineBase(turn, base);
    return [
      { event: "turn.execution.completed", payload: { type: "turn.execution.completed", ...base } },
      { event: "turn.final.delta", payload: { type: "turn.final.delta", ...finalDelta, delta: summary } },
      { event: "turn.final.completed", payload: { type: "turn.final.completed", ...finalCompleted, finalText: summary } },
      {
        event: cancelled ? "turn.cancelled" : "turn.failed",
        payload: {
          type: cancelled ? "turn.cancelled" : "turn.failed",
          ...terminal,
          status: cancelled ? "cancelled" : "failed",
          message: cancelled ? undefined : event.message,
          // MP-011: the terminal event carries a typed kind and recovery
          // action so Chat, the step panel and persistence never guess from
          // text. Untyped legacy errors classify as internal; the message
          // stays available for the caller that produced it.
          failureKind,
          recoveryAction: turnFailureRecovery(failureKind).action,
          retryable: typed?.retryable ?? false,
          diagnosticId: typed?.diagnosticId ?? (failureKind === "internal" ? createDiagnosticId() : undefined),
        },
      },
    ];
  }
  return [];
}


/**
 * Timeline SSE is a public transcript protocol, not a transport for planner
 * payloads. Keep approval prose and provider result objects on their legacy
 * internal path; the timeline exposes only the action the user can evaluate.
 */
function publicTimelinePayload(eventName: string, payload: Record<string, unknown>): TurnTimelineEvent {
  const { result: _result, approval, ...rest } = payload;
  const phase = eventName === "turn.final.delta" || eventName === "turn.final.completed" || eventName === "turn.finished"
    ? "final"
    : "working";
  const record = publicTimelineValue({ ...rest, phase: rest.phase ?? phase }) as Record<string, unknown>;
  if (approval && typeof approval === "object") {
    const source = approval as Record<string, unknown>;
    const action = source.action && typeof source.action === "object"
      ? source.action as Record<string, unknown>
      : undefined;
    record.approval = {
      id: typeof source.id === "string" ? source.id : undefined,
      riskLevel: typeof source.riskLevel === "string" ? source.riskLevel : undefined,
      action: action ? {
        tool: typeof action.tool === "string" ? action.tool : undefined,
        // Approval is the one public activity that must retain its proposed
        // arguments: the user cannot make an informed allow/deny decision
        // from a label alone. Tool output and provider payloads remain out.
        args: publicTimelineValue(action.args),
        description: typeof action.description === "string" ? action.description : undefined,
        nextHint: typeof action.nextHint === "string" ? action.nextHint : undefined,
        readiness: publicTimelineValue(action.readiness),
        preflight: publicTimelineValue(action.preflight),
        workflow: publicTimelineValue(action.workflow),
      } : undefined,
    };
  }
  return record as unknown as TurnTimelineEvent;
}

/**
 * A Timeline is durable, user-visible evidence. Approval and workflow data
 * are useful there, but plugins can attach arbitrary nested metadata; bound
 * and redact it before it reaches SSE or session persistence.
 */
function publicTimelineValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return truncatePublicValue(redact(value));
  if (depth >= 4) return "[omitted]";
  if (Array.isArray(value)) return value.slice(0, 32).map((item) => publicTimelineValue(item, depth + 1));
  if (typeof value !== "object") return undefined;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 32)) {
    // Provider/raw result envelopes and credential-shaped fields have no
    // legitimate role in an approval or workflow transcript.
    if (/(?:provider|payload|raw|credential|secret|api[_-]?key|token|authorization|password)/i.test(key)) continue;
    const publicValue = publicTimelineValue(item, depth + 1);
    if (publicValue !== undefined) output[key] = publicValue;
  }
  return output;
}

function truncatePublicValue(value: string): string {
  return value.length <= 1_200 ? value : `${value.slice(0, 1_197)}...`;
}

function enrichTurnEvent(
  event: ChatEvent,
  turn: { id: string; nextSequence: number; startedAt: number; toolStartedAt: Map<string, number>; finalTextDeltas: string[]; awaitingApproval: boolean; hasNarrative: boolean; activeToolGroupId?: string } | undefined,
): ChatEvent {
  if (!turn) return event;
  const emittedAt = Date.now();
  return {
    ...event,
    turnId: turn.id,
    sequence: turn.nextSequence++,
    emittedAt,
    elapsedMs: emittedAt - turn.startedAt,
  } as unknown as ChatEvent;
}

function nextTimelineBase(
  turn: { id: string; nextSequence: number; startedAt: number } | undefined,
  fallback?: { turnId: string; sequence?: number; emittedAt?: number; elapsedMs?: number },
): { turnId: string; sequence: number; emittedAt: number; elapsedMs: number } {
  if (turn) {
    const emittedAt = Date.now();
    return {
      turnId: turn.id,
      sequence: turn.nextSequence++,
      emittedAt,
      elapsedMs: emittedAt - turn.startedAt,
    };
  }
  const emittedAt = fallback?.emittedAt ?? Date.now();
  return {
    turnId: fallback?.turnId ?? "unknown-turn",
    sequence: fallback?.sequence ?? 0,
    emittedAt,
    elapsedMs: fallback?.elapsedMs ?? 0,
  };
}

function finalDeltas(text: string, streamed: string[] | undefined): string[] {
  const retained = streamed?.filter((delta) => Boolean(delta)) ?? [];
  const source = retained.length > 0 && normalisedText(retained.join("")) === normalisedText(text)
    ? retained
    : (text.match(/.{1,96}(?:\s+|$)/g) ?? [text]);
  return coalesceFinalDeltas(source);
}

/**
 * GPT streams can arrive one token at a time. Those are truthful provider
 * boundaries, but replaying hundreds of them at the desktop's animation
 * cadence makes a completed conclusion visibly lag behind its Turn. Preserve
 * the exact text while coalescing into short readable phrases.
 */
function coalesceFinalDeltas(chunks: string[]): string[] {
  const output: string[] = [];
  let buffer = "";
  for (const chunk of chunks) {
    buffer += chunk;
    const boundary = /\s$|[.!?。！？:]$/.test(buffer);
    if (buffer.length >= 42 && (boundary || buffer.length >= 88)) {
      output.push(buffer);
      buffer = "";
    }
  }
  if (buffer) output.push(buffer);
  return output;
}

function normalisedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isTerminalChatEvent(event: ChatEvent): boolean {
  return event.type === "done" || event.type === "error" || event.type === "cancelled";
}
