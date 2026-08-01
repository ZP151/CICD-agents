import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { LLMClient } from "./llm.js";
import type { ChatEvent } from "./chatPlannerTypes.js";

// GPT-5 counts reasoning and visible tokens against max_completion_tokens.
// Tiny probes (1–40) can finish in hidden reasoning before producing public
// text. Keep the narrator at 320 so a genuine, natural 1–2 sentence note is
// not cut off by hidden reasoning. Responsiveness is measured separately;
// lowering this ceiling proved not to improve time-to-first-token reliably.
// `reasoning_effort: minimal` and low verbosity keep this distinct from the
// main agent's deeper tool-selection and final-answer budget.
const MAX_ACTION_NARRATIVE_TOKENS = 320;
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
        "Write the public pre-action note for a desktop coding agent. Always use English.",
        "For an investigation, write one compact public paragraph of two complete, natural sentences, normally 35–75 words total. First state the relevant evidence already available or the uncertainty that must be resolved, then the immediate check or decision. Second, say what that action will establish and why it answers the user's exact request or unlocks the next decision. For a single-fact read such as current branch or status, write one natural sentence of at most 35 words. For a direct answer with no investigation, one complete sentence is enough.",
        "Start directly with the evidence, uncertainty, check, or decision; make it read like an informed teammate's brief, not a status label. Use supplied evidence only; otherwise state facts to check, never pretend unobserved project facts are known. Treat every assertion in the user request as a task constraint, not evidence: do not turn 'the changed file' into 'there is one changed file' before an action has verified it. Never begin by paraphrasing the user with phrases such as 'you indicated', 'you asked', or 'the request says'. Keep all independent requested facts in one note so the next action can collect them together. Complete the thought: never end in an ellipsis, a dangling clause, or an unfinished sentence.",
        "Do not repeat the request, widen scope, use headings/lists, expose private reasoning, or name commands, tools, flags, terminal syntax, or a predeclared command list. Do not use generic framing such as 'Based on the request', 'The goal is', or 'I will perform'.",
        "Never propose unrelated build, test, commit, PR, deployment, cloning, fetching, setup, or repository-existence checks. Do not ask the user to run a command or for permission for a clearly read-only action. For a simple answer, answer directly. Finish the second sentence with punctuation; stop after two sentences.",
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
  // long-form answer. Keep up to two complete sentences: enough for a public
  // basis → action → purpose brief, without exposing private reasoning or
  // delaying the command group indefinitely.
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
        // Do not ask the fast narrator to reserve verbosity intended for a
        // final report. GPT-5 uses this to keep the public action note dense
        // and reduce the time to a useful first visible phrase.
        verbosity: "low",
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
