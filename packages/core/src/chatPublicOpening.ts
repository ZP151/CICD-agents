import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LLMClient } from "./llm.js";
import type { ChatEvent } from "./chatPlannerTypes.js";

// GPT-5 counts reasoning and visible tokens against max_completion_tokens.
// A 40-token cap regularly finishes before any public token is available;
// 128 remains deliberately small while leaving enough room for low-effort
// reasoning plus a one- or two-sentence visible action narrative.
const MAX_ACTION_NARRATIVE_TOKENS = 128;
const MIN_INITIAL_VISIBLE_NARRATIVE_CHARS = 12;
const MAX_PUBLIC_ACTION_SENTENCES = 2;

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
  llm: Pick<LLMClient, "configured" | "chatStream"> & Partial<Pick<LLMClient, "actionNarrativeModel" | "actionNarrativeFallbackModel">>,
  input: ActionNarrativeRequest,
): AsyncGenerator<ChatEvent> {
  if (!llm.configured || !input.request.trim()) return;
  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "Write the public action narrative for a desktop coding agent.",
        "Always respond in English; this product has one English conversation path regardless of the input language.",
        "Write one or two concise natural sentences. State the current evidence or the precise facts to establish, then state what this immediate action will clarify or decide.",
        "The second sentence, when useful, must add a decision-relevant reason rather than repeat the request or list commands. Stop after two sentences.",
        "Do not repeat the user's request verbatim or use labels such as Scope, Goal, Uncertainty, Evidence, Plan, or Next step.",
        "Start directly with the check or decision; never use generic framing such as 'Based on the request', 'The goal is', or 'I will perform'. Do not widen the requested scope.",
        "Use supplied evidence only; do not claim unobserved project facts.",
        "Without completed evidence, use a direct action declaration that names the requested facts to check; never say 'Current view', 'unknown', 'not yet known', 'I cannot see', or describe the repository, files, or working-tree state as if already known.",
        "When the request lists independent facts, name the whole small evidence set in this one action declaration so one subsequent command group can collect them together.",
        "Unless the user explicitly asks, do not propose cloning, fetching, remote metadata, setup, or a repository-existence check; name the direct requested local check instead.",
        "For a simple answer, answer directly. Do not reveal private reasoning, use headings, list commands, terminal syntax, tool names, flags, or generic filler, or ask permission for a clearly read-only action.",
        "Never ask the user to run a command or provide command output: this agent performs its own permitted local checks. Refer only to the fact being checked (for example branch, local changes, or relevant files), never to the executable, query, function, or command syntax.",
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
  // This is the public decision boundary before a tool group, not a
  // long-form answer. Keep up to two complete sentences: that is enough to
  // make the activity legible (basis → action → purpose) without exposing a
  // private chain of thought or delaying the command group indefinitely.
  const models = [llm.actionNarrativeModel?.()];
  const fallbackModel = llm.actionNarrativeFallbackModel?.();
  if (fallbackModel && fallbackModel !== models[0]) models.push(fallbackModel);

  for (const [modelIndex, model] of models.entries()) {
    try {
      for await (const event of llm.chatStream({
        messages,
        maxTokens: MAX_ACTION_NARRATIVE_TOKENS,
        model,
        // The narrator is a separate GPT-5 deployment. `minimal` reserves just
        // enough reasoning budget to form a truthful public action sentence;
        // the main planning call retains its own low/medium reasoning policy.
        reasoningEffort: "minimal",
      })) {
        if (event.type !== "delta" || !event.delta) continue;
        text = appendNarrativeDelta(text, event.delta);
        if (!text || !shouldEmitNarrative(text, emittedText)) continue;
        const visibleText = text.trimEnd();
        // Never turn a genuine streamed sentence into an ellipsized fragment.
        // The narrator's token budget and two-sentence contract are the
        // bounds; a visual character clamp makes an agent look interrupted.
        input.onText?.(visibleText);
        emittedText = visibleText;
        yield {
          type: "work_statement",
          blockId: input.blockId ?? "opening",
          text: visibleText,
          replace: true,
        };
        if (hasCompleteActionNarrative(text)) return;
      }
      break;
    } catch (err) {
      // Never splice two providers into one visible narrative. Retrying is
      // safe only when the optional narrator failed before producing a token.
      if (text || modelIndex === models.length - 1) throw err;
    }
  }

  // Providers occasionally finish after a final token that does not end in
  // whitespace. Do not lose that genuine last phrase merely because it did
  // not meet the incremental word-boundary rule above.
  const finalText = text.trimEnd();
  if (finalText && finalText !== emittedText) {
    input.onText?.(finalText);
    yield { type: "work_statement", blockId: input.blockId ?? "opening", text: finalText, replace: true };
  }
}

/**
 * The first visible provider token is the only honest model feedback before
 * the next token arrives. Emit it immediately instead of buffering it into a
 * synthetic-looking phrase; later deltas replace this same Transcript block.
 */
function shouldEmitNarrative(text: string, emittedText: string): boolean {
  if (text.trimEnd() === emittedText) return false;
  if (!emittedText) return text.trim().length > 0;
  const hasBoundary = /\s$/.test(text) || /[.!?。！？]$/.test(text);
  return hasBoundary;
}

function hasCompleteActionNarrative(text: string): boolean {
  if (text.trim().length < MIN_INITIAL_VISIBLE_NARRATIVE_CHARS) return false;
  const sentenceEndings = text.match(/[.!?。！？](?:\s|$)/g)?.length ?? 0;
  return sentenceEndings >= MAX_PUBLIC_ACTION_SENTENCES;
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
