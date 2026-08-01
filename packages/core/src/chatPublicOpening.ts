import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LLMClient } from "./llm.js";
import type { ChatEvent } from "./chatPlannerTypes.js";

const MAX_ACTION_NARRATIVE_CHARS = 180;
const MAX_ACTION_NARRATIVE_TOKENS = 40;
const MIN_INITIAL_VISIBLE_NARRATIVE_CHARS = 12;

export interface ActionNarrativeRequest {
  /** The user's original request, not a synthetic progress label. */
  request: string;
  /** Bounded, user-safe evidence from a completed action group, if any. */
  evidence?: string;
  /** A real tool batch chosen by the planner, used only for a later decision. */
  plannedAction?: string;
  /** The desktop has already supplied a local Project Link target. */
  selectedProject?: boolean;
  /** Lets the Turn runtime retain the same model-authored text for continuity. */
  onText?: (text: string) => void;
  blockId?: string;
}

/**
 * Streams a concise, model-authored action narrative. The initial invocation
 * intentionally starts before repository context and tools are ready; later
 * invocations may carry completed-action evidence. There is no deterministic
 * fallback because a slow model must not be represented as fabricated thought.
 */
export async function* streamActionNarrative(
  llm: Pick<LLMClient, "configured" | "chatStream"> & Partial<Pick<LLMClient, "actionNarrativeModel">>,
  input: ActionNarrativeRequest,
): AsyncGenerator<ChatEvent> {
  if (!llm.configured || !input.request.trim()) return;
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "Write the public action narrative for a desktop coding agent.",
        "Always respond in English; this product has one English conversation path regardless of the input language.",
        "Write one compact natural sentence: current basis or uncertainty, then the immediate permitted action.",
        "Do not repeat the user's request verbatim or use labels such as Goal, Uncertainty, Evidence, Plan, or Next step.",
        "Start directly with the check or decision; never use generic framing such as 'Based on the request', 'The goal is', or 'I will perform'. Do not widen the requested scope.",
        "Use supplied evidence only; do not claim unobserved project facts.",
        "Without completed evidence, describe only the missing fact and the next check; never describe the repository, files, or working-tree state as if already known.",
        "Unless the user explicitly asks, do not propose cloning, fetching, remote metadata, setup, or a repository-existence check; name the direct requested local check instead.",
        "For a simple answer, answer directly. Do not reveal private reasoning, use headings, list commands, add generic filler, or ask permission for a clearly read-only action.",
      ].join(" "),
    },
    {
      role: "user",
      content: input.evidence
        ? [
            `User request:\n${input.request}`,
            `Completed action evidence:\n${input.evidence}`,
            input.plannedAction ? `The next action is already selected:\n${input.plannedAction}` : "",
            "Write the next action narrative.",
          ].filter(Boolean).join("\n\n")
        : [
            `User request:\n${input.request}`,
            input.selectedProject
              ? "A selected local Project Link is already available. Start with the direct requested local check; do not verify that the repository exists."
              : "No repository evidence is available yet.",
            "Write the opening action narrative.",
          ].join("\n\n"),
    },
  ];

  let text = "";
  let emittedText = "";
  // This is the public decision boundary before a tool group, not a second
  // long-form answer. End at the first complete useful sentence so the
  // planner can move on to the first real action without waiting for an
  // optional second sentence or a model's verbose continuation.
  for await (const event of llm.chatStream({
    messages,
    maxTokens: MAX_ACTION_NARRATIVE_TOKENS,
    model: llm.actionNarrativeModel?.(),
  })) {
    if (event.type !== "delta" || !event.delta) continue;
    text = appendNarrativeDelta(text, event.delta);
    if (!text || !shouldEmitNarrative(text, emittedText)) continue;
    const visibleText = text.trimEnd();
    const bounded = visibleText.length > MAX_ACTION_NARRATIVE_CHARS
      ? `${visibleText.slice(0, MAX_ACTION_NARRATIVE_CHARS - 1).trimEnd()}…`
      : visibleText;
    input.onText?.(bounded);
    emittedText = bounded;
    yield {
      type: "work_statement",
      blockId: input.blockId ?? "opening",
      text: bounded,
      replace: true,
    };
    if (text.length >= MAX_ACTION_NARRATIVE_CHARS || hasCompleteActionNarrative(text)) return;
  }

  // Providers occasionally finish after a final token that does not end in
  // whitespace. Do not lose that genuine last phrase merely because it did
  // not meet the incremental word-boundary rule above.
  const finalText = text.trimEnd();
  if (finalText && finalText !== emittedText) {
    const bounded = finalText.length > MAX_ACTION_NARRATIVE_CHARS
      ? `${finalText.slice(0, MAX_ACTION_NARRATIVE_CHARS - 1).trimEnd()}…`
      : finalText;
    input.onText?.(bounded);
    yield { type: "work_statement", blockId: input.blockId ?? "opening", text: bounded, replace: true };
  }
}

/**
 * The very first provider token is often merely "I". Waiting for a compact
 * word boundary gives the user useful live feedback without replacing it
 * with a canned status line or waiting for a whole sentence.
 */
function shouldEmitNarrative(text: string, emittedText: string): boolean {
  if (text.trimEnd() === emittedText) return false;
  const hasBoundary = /\s$/.test(text) || /[.!?。！？]$/.test(text);
  if (!emittedText) return text.trim().length >= MIN_INITIAL_VISIBLE_NARRATIVE_CHARS && hasBoundary;
  return hasBoundary;
}

function hasCompleteActionNarrative(text: string): boolean {
  // A sentence that describes the missing fact and immediate action is the
  // public hand-off to tool selection. Its next sentence is not a reason to
  // delay the actual command group; later evidence can create another real
  // narrative block if a fresh decision is required.
  return text.trim().length >= MIN_INITIAL_VISIBLE_NARRATIVE_CHARS
    && /[.!?。！？]\s*$/.test(text);
}

function appendNarrativeDelta(previous: string, delta: string): string {
  // Keep the provider's leading whitespace when it represents the boundary
  // between words. Trimming every delta made ordinary streams render as
  // "I'llinspect". Do not infer a word boundary from adjacent letters:
  // tokenizers also split one word into subword chunks ("un" + "committed").
  // Only repair a missing separator after sentence punctuation.
  const normalized = delta.replace(/\s+/g, " ");
  if (!normalized) return previous;
  if (!previous) return normalized.trimStart();
  if (/^\s/.test(normalized)) return `${previous}${normalized}`;
  const separator = /[.!?]$/.test(previous) && /^[A-Za-z0-9]/.test(normalized) ? " " : "";
  return `${previous}${separator}${normalized}`;
}

/** @deprecated Use streamActionNarrative with an explicit request object. */
export async function* streamPublicTurnOpening(
  llm: Pick<LLMClient, "configured" | "chatStream"> & Partial<Pick<LLMClient, "actionNarrativeModel">>,
  request: string,
): AsyncGenerator<ChatEvent> {
  yield* streamActionNarrative(llm, { request, blockId: "opening" });
}
