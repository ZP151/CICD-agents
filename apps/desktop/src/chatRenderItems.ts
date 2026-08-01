export interface ChatRenderBubbleLike {
  id: string;
  kind: string;
  turnId?: string;
  turnTranscript?: unknown;
}

export type ChatRenderItem<T extends ChatRenderBubbleLike> =
  | { kind: "tool-group"; tools: T[]; approval?: T; key: string }
  | { kind: "transcript"; transcript: T; approval?: T; key: string }
  | { kind: "bubble"; bubble: T };

export function groupChatRenderItems<T extends ChatRenderBubbleLike>(bubbles: T[]): ChatRenderItem<T>[] {
  const items: ChatRenderItem<T>[] = [];
  let consecutiveExecution: T[] = [];
  let afterCanonicalTranscript = false;
  const transcriptOwnedExecution = new Set<string>();
  // A canonical transcript is the sole rendering authority for its Turn. Old
  // transports can still replay tool bubbles during migration, but must not
  // create a second execution presentation beside the transcript.
  const canonicalTurnIds = new Set(
    bubbles
      .filter(isTurnTranscriptBubble)
      .map((bubble) => bubble.turnId)
      .filter((turnId): turnId is string => Boolean(turnId)),
  );

  for (let index = 0; index < bubbles.length; index += 1) {
    const bubble = bubbles[index]!;
    if (transcriptOwnedExecution.has(bubble.id)) continue;
    if (isExecutionBubble(bubble) && bubble.turnId && canonicalTurnIds.has(bubble.turnId)) continue;
    if (afterCanonicalTranscript && isExecutionBubble(bubble)) continue;
    if (isTurnTranscriptBubble(bubble)) {
      appendExecutionItems(items, consecutiveExecution);
      consecutiveExecution = [];
      const approval = approvalForTranscript(bubble, bubbles, index, transcriptOwnedExecution);
      items.push({ kind: "transcript", transcript: bubble, approval, key: bubble.id });
      afterCanonicalTranscript = true;
      continue;
    }
    if (!isExecutionBubble(bubble)) afterCanonicalTranscript = false;
    if (bubble.kind === "tool" || bubble.kind === "pending_confirm") {
      consecutiveExecution.push(bubble);
      continue;
    }
    appendExecutionItems(items, consecutiveExecution);
    consecutiveExecution = [];
    items.push({ kind: "bubble", bubble });
  }

  appendExecutionItems(items, consecutiveExecution);
  return items;
}

function approvalForTranscript<T extends ChatRenderBubbleLike>(
  transcript: T,
  bubbles: T[],
  transcriptIndex: number,
  owned: Set<string>,
): T | undefined {
  if (!transcript.turnId) return undefined;
  for (let index = transcriptIndex + 1; index < bubbles.length; index += 1) {
    const candidate = bubbles[index]!;
    if (candidate.kind === "user" || isTurnTranscriptBubble(candidate)) break;
    if (candidate.kind === "pending_confirm" && candidate.turnId === transcript.turnId) {
      owned.add(candidate.id);
      return candidate;
    }
  }
  return undefined;
}

function isExecutionBubble<T extends ChatRenderBubbleLike>(bubble: T): boolean {
  return bubble.kind === "tool" || bubble.kind === "pending_confirm";
}

function isTurnTranscriptBubble<T extends ChatRenderBubbleLike>(bubble: T): boolean {
  return bubble.kind === "system" && "turnTranscript" in bubble && Boolean(bubble.turnTranscript);
}

/**
 * Keep each command group exactly where it occurred in the event stream.
 * A later system marker or assistant note must not cause earlier and later
 * commands to be collapsed into one pre-rendered block.
 */
function appendExecutionItems<T extends ChatRenderBubbleLike>(
  items: ChatRenderItem<T>[],
  execution: T[],
): void {
  if (execution.length === 0) return;

  const tools = execution.filter((bubble) => bubble.kind === "tool");
  const approvals = execution.filter((bubble) => bubble.kind === "pending_confirm");
  const attachedApproval = tools.length > 0 ? approvals[approvals.length - 1] : undefined;
  if (tools.length > 0) {
    items.push({ kind: "tool-group", tools, approval: attachedApproval, key: tools[0]!.id });
  }

  for (const bubble of execution) {
    if (bubble.kind === "pending_confirm" && bubble !== attachedApproval) {
      items.push({ kind: "bubble", bubble });
    }
  }
}
