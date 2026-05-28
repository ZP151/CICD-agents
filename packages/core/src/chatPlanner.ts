import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LLMUnavailableError, type LLMClient } from "./llm.js";
import { translateIntent } from "./tools/gitIntent.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";
import type { ToolExecutor } from "./tools/executor.js";
import { toolCapabilityPrompt } from "./tools/capabilities.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

/** A specific write-operation the agent is proposing to execute on user confirmation. */
export interface PendingToolAction {
  tool: string;                       // e.g. "git_add", "git_commit", "git_push"
  args: Record<string, unknown>;      // tool arguments
  description: string;               // human-readable, e.g. "Stage all modified files"
  nextHint?: string;                  // what comes after, e.g. "generate commit message"
}

export interface ChatPlannerResult {
  response: string;
  riskLevel: string;
  actionsTaken: string[];
  suggestions: string[];
  toolCallsMade: Array<{ name: string; args: Record<string, unknown>; ok: boolean }>;
  usedLlm: boolean;
  approvalProposal?: PendingToolAction; // internal structured approval proposal for write actions
}

export interface ChatApprovalRequest {
  id: string;
  action: PendingToolAction;
  riskLevel: string;
  explanation: string;
}

export interface ChatWorkflowState {
  status: "planning" | "running" | "waiting_for_approval" | "blocked" | "done" | "failed";
  currentStep: string;
  completedTools: string[];
  pendingApproval?: ChatApprovalRequest;
}

/** Returns true if the message is a user affirmation (yes/proceed/action-forward). */
export function isConfirmationMessage(msg: string): boolean {
  const t = msg.trim().toLowerCase().replace(/[.!?，。！？]+$/, "").trim();
  // Short one-word/phrase affirmations
  if (/^(yes|y|yep|yeah|proceed|go ahead|do it|do that|continue|sure|ok|okay|confirm|run it|execute|sounds good|let's go|let's do it|go|start|begin|approve|approved|accepted|agreed|correct|right|perfect|great|good|fine)$/.test(t)) return true;
  // Action-forward messages: stage / commit / push / create pr — with optional qualifiers
  if (/^(stage|stage (all|them|it|changes|everything|the (files|changes))|git add|add all|commit|commit (all|them|it|the changes)|push|push (it|them|the branch|to remote|origin)|create (the |a )?pr|open (the |a )?pr|create (the |a )?pull request)(\s+(and\s+)?(stage|commit|push|create pr|open pr))*/.test(t)) return true;
  // Compound phrases like "stage commit and push", "stage and commit and push them to remote"
  if (/\b(stage|commit|push)\b.*\b(commit|push|remote)\b/.test(t)) return true;
  // Explicit confirmation intent
  if (/^(go ahead|please do|please proceed|please (stage|commit|push)|yes please|sounds good|looks good|do (the )?stage|do (the )?commit|do (the )?push)/.test(t)) return true;
  return false;
}

/** Returns true if the message is a user denial (no / cancel / etc.) */
export function isDenialMessage(msg: string): boolean {
  return /^\s*(no|n|nope|cancel|stop|not now|do not|don't|skip|abort|never mind|nevermind|hold on|wait)\s*[.!?]*\s*$/i.test(
    msg.trim(),
  );
}

export type ChatEvent =
  | { type: "assistant_delta"; delta: string }
  | { type: "progress"; message: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok: boolean; summary: string; result: unknown }
  | { type: "confirm_required"; riskLevel: string; plan: string }
  | { type: "workflow_state"; state: ChatWorkflowState }
  | { type: "approval_required"; approval: ChatApprovalRequest }
  | { type: "approval_resolved"; approvalId: string; approved: boolean }
  | { type: "executing" }
  | { type: "message"; text: string }
  | { type: "done"; result: ChatPlannerResult }
  | { type: "error"; message: string }
  | { type: "cancelled" };

// ─── System prompt ────────────────────────────────────────────────────────────

export const CHAT_SYSTEM_PROMPT = `You are an autonomous Dev Agent specializing in Git and CI/CD workflows. Your job is to EXECUTE operations on behalf of the developer, not just advise.

## Golden Rule: Continue what was proposed
If the user's message is a short affirmation — "yes", "proceed", "go ahead", "do it", "continue", "sure", "ok", "yeah", "yep", "y" — look at the PREVIOUS assistant message in the conversation and execute the action that was proposed there IMMEDIATELY. Do NOT ask for confirmation again. Do NOT restate what you're about to do. Just execute it.

## Workflow Orchestration
When the user asks you to help with a goal like "until PR", "from review to merge", "help me commit and push", understand this as a multi-step workflow:
1. Quickly understand the user's goal and the lightweight repository context provided in the user message when it is relevant.
2. Use project docs, file-structure signals, and profile settings when they help answer the request.
3. Run Git read operations automatically only when they are useful for the user's goal (status, log, diff, branch list).
4. Summarize what you found: relevant code/docs, modified files, untracked files, risks, recommended scope.
5. Propose the next write action clearly (e.g. "I'll stage all 4 modified files and generate a commit message. Shall I proceed?").
6. On user confirmation, execute the write action WITHOUT re-asking.
7. After each write action, use known context first, then run only the read checks needed for the next decision.
8. Continue until the goal is complete (PR created or requested endpoint reached) or the user stops you.

## Repository Context
The user message may include a "Repository context" section assembled from a quick project scan, project docs, file-structure signals, profile settings, and sometimes existing semantic index data. Treat this context as helpful local knowledge, not as a mandatory first step.
- For project understanding questions, use repository context when it is relevant and sufficient.
- Do not call Git tools or force repository-index assumptions just because tools/context are available.
- Call Git tools when the user asks about current changes, branch state, commit/PR workflow, or when repository context says changed files are relevant.
- If repository context is insufficient, use safe read-only tools to gather missing facts.

## Autonomy table
| Operation | Autonomy |
|-----------|----------|
| Registered read-only tools | Run immediately when useful |
| Registered write tools | Run only when the user clearly requested that exact action, or after approval |
| Medium/high risk write tools | Prefer proposing an approval_proposal with exact args before execution |
| Destructive or remote-changing tools | Always require explicit approval |

## Tool selection guide
- Use the Available tool capabilities registry as the source of truth.
- Do not invent tool names.
- Do not assume every workflow must stage, commit, push, and create a PR.
- For a proposed next action, choose the registered write tool that directly matches the user's goal.
- Fill required arguments exactly as the tool schema requires.

## Risk Classification
- low    — read-only inspection.
- medium — local working-tree or branch changes.
- high   — remote changes, PR creation, pipeline triggering, or destructive operations.

## Error Recovery (CRITICAL)
When a tool result contains non-zero returncode, a non-empty stderr, or an obvious failure:
1. Read the error message carefully — understand WHY it failed before acting.
2. Do NOT call the same tool with the same arguments again — that will produce the same failure.
3. Diagnose the root cause: wrong branch? uncommitted conflicts? bad arguments? permission denied?
4. Apply a targeted fix, then retry with corrected arguments if appropriate.
5. If the same tool fails twice in a row, stop retrying. Report the error to the user with a clear diagnosis and next-step suggestion.

Examples of correct error handling:
- git_commit fails → read the error, check staged files with git_status, then retry with corrected args.
- git_push fails with "non-fast-forward" → run git_pull --rebase first, then push again.
- git_add fails with "pathspec not found" → verify the file path with git_status first.

## MANDATORY Response Format
After completing your work, output ONLY this JSON on its own line (no other text after it):
{"response":"...","risk_level":"low|medium|high","actions_taken":["..."],"suggestions":[],"approval_proposal":{"tool":"...","args":{},"description":"...","nextHint":"..."}}

## MANDATORY approval_proposal Rules
- If your "response" text contains "Shall I", "Should I", "Do you want me to", "Ready to", or proposes a next write action → YOU MUST set "approval_proposal" to the exact tool+args.
- DO NOT output "approval_proposal": null. Either include it as an object, or omit the key entirely.
- "approval_proposal".tool must be a registered write tool from the Available tool capabilities registry.
- "approval_proposal".args must be the exact args you would pass to the tool if the user says yes.
- Include a concise "description" and, when helpful, a "nextHint" for the continuation step.
- If the user goal does not require another write action, omit "approval_proposal".

## Examples
Proposing staging → approval_proposal REQUIRED:
{"response":"I found 4 modified files. Shall I stage all of them?","risk_level":"medium","actions_taken":["git_status"],"suggestions":[],"approval_proposal":{"tool":"git_add","args":{},"description":"Stage all changes","nextHint":"generate commit message"}}

After executing (no proposal) → no approval_proposal key:
{"response":"All files staged successfully.","risk_level":"low","actions_taken":["git_add"],"suggestions":[]}`;

// ─── ChatPlanner ──────────────────────────────────────────────────────────────

export class ChatPlanner {
  private readonly maxSteps: number;

  constructor(
    private readonly llm: LLMClient,
    private readonly executor: ToolExecutor,
    opts: { maxSteps?: number } = {},
  ) {
    this.maxSteps = opts.maxSteps ?? getSettings().plannerMaxSteps;
  }

  /**
   * Run one conversational turn.
   * `waitForConfirm` is called (and awaited) when the LLM produces a
   * medium/high-risk plan — the SSE stream stays open until the caller
   * resolves it with true (confirm) or false (cancel).
   */
  async *run(
    message: string,
    history: ChatMessage[],
    repoPath: string,
    waitForConfirm: () => Promise<boolean>,
    contextPrompt?: string,
  ): AsyncGenerator<ChatEvent> {
    if (!this.llm.configured) {
      yield* this._offlineFallback(message);
      return;
    }

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: [CHAT_SYSTEM_PROMPT, toolCapabilityPrompt(this.executor.list())]
          .filter(Boolean)
          .join("\n\n"),
      },
      ...history.slice(-20).map(
        (m): ChatCompletionMessageParam => ({ role: m.role, content: m.content }),
      ),
      {
        role: "user",
        content: [
          `Working directory: ${repoPath}`,
          contextPrompt ? contextPrompt : "",
          `## User request\n${message}`,
        ].filter(Boolean).join("\n\n"),
      },
    ];

    const tools = this.executor.schemas();
    const toolCallsMade: ChatPlannerResult["toolCallsMade"] = [];
    let lastText = "";
    let confirmedOnce = false;
    // Track consecutive failures of the same tool to prevent infinite retry loops.
    let lastFailedTool = "";
    let consecutiveFailCount = 0;

    for (let step = 0; step < this.maxSteps; step++) {
      let accumulated = "";
      let toolFromStream: import("./llm.js").ChatToolCall[] = [];

      try {
        for await (const ev of this.llm.chatStream({ messages, tools, maxTokens: 2000 })) {
          if (ev.type === "delta" && ev.delta) {
            accumulated += ev.delta;
          } else if (ev.type === "tool_call" && ev.toolCalls) {
            toolFromStream = ev.toolCalls;
          }
        }
      } catch (err) {
        if (err instanceof LLMUnavailableError) {
          yield { type: "error", message: "LLM became unavailable mid-stream." };
          return;
        }
        throw err;
      }

      // ── Tool calls ──────────────────────────────────────────────────────────
      if (toolFromStream.length > 0) {
        messages.push({
          role: "assistant",
          content: accumulated || null,
          tool_calls: toolFromStream.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });

        for (const tc of toolFromStream) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
          } catch {
            args = {};
          }

          yield { type: "tool_start", name: tc.name, args };
          let toolResult: unknown;
          let ok = true;
          try {
            toolResult = await this.executor.call(tc.name, args);
          } catch (err) {
            ok = false;
            toolResult = { error: err instanceof Error ? err.message : String(err) };
          }
          const summary = ok
            ? truncate(JSON.stringify(toolResult), 200)
            : `error: ${JSON.stringify(toolResult)}`;
          yield { type: "tool_end", name: tc.name, ok, summary, result: toolResult };
          toolCallsMade.push({ name: tc.name, args, ok });

          // Detect consecutive failures of the same tool → abort the loop early
          if (!ok) {
            if (tc.name === lastFailedTool) {
              consecutiveFailCount++;
            } else {
              lastFailedTool = tc.name;
              consecutiveFailCount = 1;
            }
            if (consecutiveFailCount >= 2) {
              const errMsg = typeof toolResult === "object" && toolResult !== null
                ? ((toolResult as Record<string, unknown>)["error"] as string | undefined)
                    ?? JSON.stringify(toolResult).slice(0, 200)
                : String(toolResult);
              yield {
                type: "done",
                result: {
                  response: `The \`${tc.name}\` tool failed twice in a row. Last error:\n\n\`\`\`\n${errMsg}\n\`\`\`\n\nPlease check the above error and let me know how to proceed.`,
                  riskLevel: "low",
                  actionsTaken: toolCallsMade.map((t) => t.name),
                  suggestions: [],
                  toolCallsMade,
                  usedLlm: true,
                },
              };
              return;
            }
          } else {
            // Reset on success
            lastFailedTool = "";
            consecutiveFailCount = 0;
          }

          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: truncate(
              JSON.stringify(ok ? { ok: true, result: toolResult } : toolResult),
              4000,
            ),
          });
        }
        continue;
      }

      // ── Text response — try to parse final JSON ─────────────────────────────
      lastText = accumulated;
      messages.push({ role: "assistant", content: lastText });

      const parsed = parseFinalJson(lastText);
      if (parsed) {
        const riskLevel = String(parsed["risk_level"] ?? "low");
        const response = String(parsed["response"] ?? lastText);
        const actionsTaken = ((parsed["actions_taken"] as unknown[]) ?? []).map(String);
        const suggestions = ((parsed["suggestions"] as unknown[]) ?? []).map(String);
        const rawApprovalProposal = parsed["approval_proposal"] ?? parsed["pending_action"];
        const approvalProposal: PendingToolAction | undefined =
          rawApprovalProposal && typeof rawApprovalProposal === "object"
            ? {
                // Strip legacy "functions." prefix that some LLMs emit (e.g. functions.git_commit)
                tool: String((rawApprovalProposal as Record<string, unknown>)["tool"] ?? "").replace(/^functions\./, ""),
                args: ((rawApprovalProposal as Record<string, unknown>)["args"] as Record<string, unknown>) ?? {},
                description: String((rawApprovalProposal as Record<string, unknown>)["description"] ?? ""),
                nextHint: String((rawApprovalProposal as Record<string, unknown>)["nextHint"] ?? ""),
              }
            : undefined;

        // Risk gating: pause for confirmation on medium/high risk actions
        // that haven't been confirmed yet and haven't executed tools yet.
        if (
          !confirmedOnce &&
          (riskLevel === "medium" || riskLevel === "high") &&
          !approvalProposal &&
          toolCallsMade.length === 0
        ) {
          yield { type: "confirm_required", riskLevel, plan: response };
          const confirmed = await waitForConfirm();
          if (!confirmed) {
            yield { type: "cancelled" };
            return;
          }
          confirmedOnce = true;
          yield { type: "executing" };
          messages.push({
            role: "user",
            content: "Confirmed. Please proceed with the planned actions now.",
          });
          continue;
        }

        yield {
          type: "done",
          result: {
            response,
            riskLevel,
            actionsTaken,
            suggestions,
            toolCallsMade,
            usedLlm: true,
            approvalProposal: approvalProposal?.tool ? approvalProposal : undefined,
          },
        };
        return;
      }

      // No structured JSON yet — nudge the model
      messages.push({
        role: "user",
        content:
          'Please provide your final response as a single JSON line. If you are proposing a write action, you MUST include approval_proposal. Format: {"response":"...","risk_level":"low|medium|high","actions_taken":[],"suggestions":[],"approval_proposal":{"tool":"git_add","args":{},"description":"...","nextHint":"..."}} — omit approval_proposal only if you are NOT proposing any next write action.',
      });
    }

    // Step limit reached — return whatever we have
    logger().warn({ step: this.maxSteps }, "chat planner hit step limit");
    yield {
      type: "done",
      result: {
        response: lastText || "(no response)",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
        toolCallsMade,
        usedLlm: true,
      },
    };
  }

  private async *_offlineFallback(message: string): AsyncGenerator<ChatEvent> {
    const plan = translateIntent(message);
    const stepList = plan.steps.map((s, i) => `${i + 1}. ${s.tool} — ${s.note}`).join("\n");
    const response =
      `LLM not configured — showing intent analysis only.\n\n` +
      `Intent: ${plan.intent}\n${plan.notes}\n\n` +
      (stepList ? `Suggested steps:\n${stepList}` : "");
    yield { type: "message", text: response };
    yield {
      type: "done",
      result: {
        response,
        riskLevel: "low",
        actionsTaken: [],
        suggestions: plan.steps.map((s) => `${s.tool}: ${s.note}`),
        toolCallsMade: [],
        usedLlm: false,
      },
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseFinalJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  // Look for the last complete JSON object that has a "response" key
  const close = text.lastIndexOf("}");
  if (close === -1) return null;
  // Walk backwards to find the matching open brace
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") {
      depth--;
      if (depth === 0) {
        try {
          const obj = JSON.parse(text.slice(i, close + 1)) as Record<string, unknown>;
          if ("response" in obj) return obj;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
