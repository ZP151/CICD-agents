import type { ChatEventPayload } from "../../api.js";
import { toolCommandPreview } from "../../components/conversation/ApprovalEvidenceModel.js";
import type { Bubble, TurnTranscript, TurnTranscriptBlock } from "./chat.types.js";

const MAX_STATEMENT_LENGTH = 280;

/**
 * The transcript is the sole user-visible execution record for a Turn.
 * Legacy bubbles may still exist while sessions migrate, but are not used to
 * reconstruct its order or nesting.
 */
export function createOptimisticTurnTranscriptBubble(
  id: string,
  request: string,
  startedAt = Date.now(),
): Bubble {
  return {
    id,
    kind: "system",
    text: "Working",
    turnId: `local-turn-${id}`,
    timestamp: startedAt,
    turnTranscript: {
      startedAt,
      status: "working",
      executionSealed: false,
      // This local surface owns only the Turn clock. Its prose must never be
      // a canned stand-in for agent reasoning; the first statement arrives
      // from the agent as a public Timeline event.
      blocks: [],
      pendingGroups: {},
    },
  };
}

export function upsertTurnStartedTranscript(
  bubbles: Bubble[],
  event: ChatEventPayload,
  makeId: () => string,
): Bubble[] {
  const startedAt = typeof event.emittedAt === "number" ? event.emittedAt : Date.now();
  const localIndex = findLocalTranscriptForStart(bubbles, event.clientTurnId);
  if (localIndex >= 0) {
    return bubbles.map((bubble, index) => index === localIndex && bubble.turnTranscript
      ? {
          ...bubble,
          turnId: event.turnId,
          timestamp: bubble.timestamp ?? bubble.turnTranscript.startedAt,
          turnTranscript: {
            ...bubble.turnTranscript,
            status: "working",
          },
        }
      : bubble);
  }

  return [...bubbles, {
    id: makeId(),
    kind: "system",
    text: "Working",
    turnId: event.turnId,
    timestamp: startedAt,
    turnTranscript: {
      startedAt,
      status: "working",
      executionSealed: false,
      blocks: [],
      pendingGroups: {},
    },
  }];
}

export function applyTurnTimelineEvent(
  bubbles: Bubble[],
  event: ChatEventPayload,
): Bubble[] {
  if (!event.turnId || !isTranscriptEvent(event.type)) return bubbles;
  const index = findWorkingTranscript(bubbles, { turnId: event.turnId });
  if (index < 0) return bubbles;
  const bubble = bubbles[index]!;
  if (!bubble.turnTranscript || shouldIgnoreSequence(bubble.turnTranscript, event.sequence)) return bubbles;
  const transcript = reduceTurnTranscript(bubble.turnTranscript, event);
  return bubbles.map((entry, entryIndex) => entryIndex === index
    ? { ...entry, text: transcriptLabel(transcript), turnTranscript: transcript }
    : entry);
}

/** A final is never allowed to be rendered while its Working canvas is open. */
export function sealTurnTranscriptExecution(
  bubbles: Bubble[],
  turnId: string | undefined,
  finalText?: string,
): Bubble[] {
  if (!turnId) return bubbles;
  return bubbles.map((bubble) => bubble.turnId === turnId && bubble.turnTranscript && (!bubble.turnTranscript.executionSealed || Boolean(finalText?.trim()))
    ? {
        ...bubble,
        text: "Worked",
        turnTranscript: {
          ...bubble.turnTranscript,
          status: "sealed",
          executionSealed: true,
          elapsedMs: bubble.turnTranscript.elapsedMs ?? Math.max(0, Date.now() - bubble.turnTranscript.startedAt),
          blocks: removeDuplicatedNoToolAnswer(bubble.turnTranscript.blocks, finalText),
        },
      }
    : bubble);
}

/**
 * A simple question may receive its genuine answer as the earliest model
 * stream, before the planner knows that no command is needed. Once the same
 * text becomes the final answer, keep it outside the collapsed Working
 * canvas only. Tool evidence and distinct action narratives are never
 * removed.
 */
function removeDuplicatedNoToolAnswer(
  blocks: TurnTranscriptBlock[],
  finalText: string | undefined,
): TurnTranscriptBlock[] {
  if (!finalText?.trim() || blocks.some((block) => block.kind !== "statement")) return blocks;
  const normalizedFinal = comparableText(finalText);
  return blocks.filter((block) => block.kind !== "statement" || comparableText(block.text) !== normalizedFinal);
}

function comparableText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function isTranscriptEvent(type: ChatEventPayload["type"]): boolean {
  return type === "turn.completed"
    || type === "turn.narrative.delta"
    || type === "turn.waiting"
    || type === "turn.work.statement"
    || type === "turn.tool_group.started"
    || type === "turn.tool_group.completed"
    || type === "turn.tool.started"
    || type === "turn.tool.completed"
    || type === "turn.approval.requested"
    || type === "turn.approval.resolved"
    || type === "turn.execution.completed"
    || type === "turn.finished"
    || type === "turn.failed"
    || type === "turn.cancelled";
}

export function turnTranscriptElapsedMs(transcript: TurnTranscript, now = Date.now()): number {
  return transcript.elapsedMs ?? Math.max(0, now - transcript.startedAt);
}

function reduceTurnTranscript(transcript: TurnTranscript, event: ChatEventPayload): TurnTranscript {
  const next: TurnTranscript = {
    ...transcript,
    blocks: transcript.blocks,
    pendingGroups: transcript.pendingGroups,
    lastSequence: typeof event.sequence === "number" ? event.sequence : transcript.lastSequence,
  };

  switch (event.type) {
    case "turn.narrative.delta":
    case "turn.work.statement":
      return { ...appendStatement(next, event), waitingForModel: false };
    case "turn.waiting":
      return { ...next, waitingForModel: true };
    case "turn.tool_group.started":
      return {
        ...next,
        pendingGroups: {
          ...next.pendingGroups,
          [event.groupId ?? event.blockId ?? fallbackGroupId(event)]: { connector: event.connector },
        },
      };
    case "turn.tool.started":
      return appendCommand(next, event);
    case "turn.tool.completed":
      return completeCommand(next, event);
    case "turn.approval.requested":
      return appendApproval(next, event);
    case "turn.approval.resolved":
      return resolveApproval(next, event);
    case "turn.tool_group.completed":
      return next;
    case "turn.execution.completed":
      return { ...next, status: "sealed", executionSealed: true, waitingForModel: false, elapsedMs: event.elapsedMs ?? next.elapsedMs };
    case "turn.finished":
    case "turn.completed":
      return { ...next, status: "completed", executionSealed: true, waitingForModel: false, elapsedMs: event.elapsedMs ?? next.elapsedMs };
    case "turn.failed":
      return { ...next, status: "failed", executionSealed: true, waitingForModel: false, elapsedMs: event.elapsedMs ?? next.elapsedMs };
    case "turn.cancelled":
      return { ...next, status: "cancelled", executionSealed: true, waitingForModel: false, elapsedMs: event.elapsedMs ?? next.elapsedMs };
    default:
      return next;
  }
}

function appendApproval(transcript: TurnTranscript, event: ChatEventPayload): TurnTranscript {
  const id = event.approval?.id ?? event.approvalId ?? `approval-${event.sequence ?? transcript.blocks.length}`;
  const text = normalizeStatement(
    event.approval?.action?.description
      ? `Approval is needed before: ${event.approval.action.description}`
      : "Approval is required before this action can run.",
  );
  const block: Extract<TurnTranscriptBlock, { kind: "approval" }> = {
    kind: "approval",
    id,
    text,
    status: "waiting",
  };
  const existing = transcript.blocks.find((candidate) => candidate.kind === "approval" && candidate.id === id);
  return {
    ...transcript,
    blocks: existing
      ? transcript.blocks.map((candidate) => candidate.kind === "approval" && candidate.id === id ? block : candidate)
      : [...transcript.blocks, block],
  };
}

function resolveApproval(transcript: TurnTranscript, event: ChatEventPayload): TurnTranscript {
  const id = event.approvalId;
  if (!id) return transcript;
  return {
    ...transcript,
    blocks: transcript.blocks.map((block) => block.kind !== "approval" || block.id !== id
      ? block
      : { ...block, status: event.approved ? "approved" : "rejected" }),
  };
}

function appendStatement(transcript: TurnTranscript, event: ChatEventPayload): TurnTranscript {
  const text = normalizeStatement(event.message ?? event.delta ?? "");
  if (!text) return transcript;
  const id = event.blockId ?? "opening";
  const current = transcript.blocks.find((block): block is Extract<TurnTranscriptBlock, { kind: "statement" }> => (
    block.kind === "statement" && block.id === id
  ));
  const nextText = event.replace || !current ? text : normalizeStatement(`${current.text}${text}`);
  const statement: Extract<TurnTranscriptBlock, { kind: "statement" }> = {
    kind: "statement",
    id,
    text: nextText,
    source: "server",
  };
  const blocks = current
    ? transcript.blocks.map((block) => block.kind === "statement" && block.id === id ? statement : block)
    : [...transcript.blocks, statement];
  return { ...transcript, blocks };
}

function appendCommand(transcript: TurnTranscript, event: ChatEventPayload): TurnTranscript {
  const groupId = event.groupId ?? event.toolCallId ?? fallbackGroupId(event);
  const commandId = event.commandId ?? event.toolCallId ?? `${groupId}-command`;
  const command = event.command?.trim() || commandLabel(event.name, event.args);
  const existing = transcript.blocks.find((block): block is Extract<TurnTranscriptBlock, { kind: "tool_group" }> => (
    block.kind === "tool_group" && block.id === groupId
  ));
  const commandEntry = {
    id: commandId,
    name: event.name ?? "command",
    args: event.args,
    command,
    status: "running" as const,
  };
  if (existing) {
    if (existing.commands.some((entry) => entry.id === commandId)) return transcript;
    return {
      ...transcript,
      blocks: transcript.blocks.map((block) => block.kind === "tool_group" && block.id === groupId
        ? { ...block, commands: [...block.commands, commandEntry] }
        : block),
    };
  }
  const pending = transcript.pendingGroups[groupId];
  const nextPending = { ...transcript.pendingGroups };
  delete nextPending[groupId];
  return {
    ...transcript,
    pendingGroups: nextPending,
    blocks: [...transcript.blocks, {
      kind: "tool_group",
      id: groupId,
      label: "Ran commands",
      connector: event.connector ?? pending?.connector,
      commands: [commandEntry],
    }],
  };
}

function completeCommand(transcript: TurnTranscript, event: ChatEventPayload): TurnTranscript {
  const commandId = event.commandId ?? event.toolCallId;
  if (!commandId) return transcript;
  return {
    ...transcript,
    blocks: transcript.blocks.map((block) => block.kind !== "tool_group"
      ? block
      : {
          ...block,
          commands: block.commands.map((command) => command.id === commandId
            ? {
                ...command,
                status: event.ok === false ? "failed" : "succeeded",
                durationMs: event.durationMs,
                summary: event.summary,
                output: event.output,
              }
            : command),
        }),
  };
}

function findWorkingTranscript(
  bubbles: Bubble[],
  options: { turnId?: string; localOnly?: boolean },
): number {
  for (let index = bubbles.length - 1; index >= 0; index -= 1) {
    const bubble = bubbles[index];
    if (!bubble?.turnTranscript || (bubble.turnTranscript.status !== "working" && bubble.turnTranscript.status !== "sealed")) continue;
    if (options.localOnly && bubble.turnId?.startsWith("local-turn-")) return index;
    if (options.turnId && bubble.turnId === options.turnId) return index;
  }
  return -1;
}

/**
 * A server acknowledgement must never adopt an unrelated optimistic Turn.
 * New daemons echo the client id; old sidecars can only be safely adopted
 * when exactly one local Turn is waiting for acknowledgement.
 */
function findLocalTranscriptForStart(bubbles: Bubble[], clientTurnId: string | undefined): number {
  const local = bubbles
    .map((bubble, index) => ({ bubble, index }))
    .filter(({ bubble }) => (
      bubble.turnTranscript?.status === "working" && bubble.turnId?.startsWith("local-turn-")
    ));
  if (clientTurnId) return local.find(({ bubble }) => bubble.turnId === clientTurnId)?.index ?? -1;
  return local.length === 1 ? local[0]!.index : -1;
}

function shouldIgnoreSequence(transcript: TurnTranscript, sequence: number | undefined): boolean {
  return typeof sequence === "number"
    && typeof transcript.lastSequence === "number"
    && sequence <= transcript.lastSequence;
}

function fallbackGroupId(event: ChatEventPayload): string {
  return `group-${event.sequence ?? event.name ?? "unknown"}`;
}

function normalizeStatement(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > MAX_STATEMENT_LENGTH
    ? `${normalized.slice(0, MAX_STATEMENT_LENGTH - 1).trimEnd()}…`
    : normalized;
}


function commandLabel(name: string | undefined, args: Record<string, unknown> | undefined): string {
  const preview = toolCommandPreview(name, args);
  if (preview) return preview;
  const serialized = args && Object.keys(args).length > 0 ? ` ${compactArgs(args)}` : "";
  return `${name ?? "command"}${serialized}`.trim();
}

function compactArgs(args: Record<string, unknown>): string {
  try {
    const text = JSON.stringify(args);
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  } catch {
    return "";
  }
}

function transcriptLabel(transcript: TurnTranscript): string {
  if (transcript.status === "working") return "Working";
  if (transcript.status === "completed" || transcript.status === "sealed") return "Worked";
  if (transcript.status === "cancelled") return "Cancelled";
  return "Stopped";
}
