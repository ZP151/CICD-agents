import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LLMUnavailableError, type LLMClient } from "./llm.js";
import { translateIntent } from "./tools/gitIntent.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";
import type { ToolExecutor } from "./tools/executor.js";

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
  pendingAction?: PendingToolAction;  // set when the response proposes a write action
}

/** Returns true if the message is a short user affirmation (yes / proceed / etc.) */
export function isConfirmationMessage(msg: string): boolean {
  return /^\s*(yes|y|yep|yeah|proceed|go ahead|do it|do that|continue|sure|ok|okay|confirm|run it|execute|sounds good|let's go|let's do it|go|start|begin)\s*[.!]*\s*$/i.test(
    msg.trim(),
  );
}

/** Returns true if the message is a short user denial (no / cancel / etc.) */
export function isDenialMessage(msg: string): boolean {
  return /^\s*(no|n|nope|cancel|stop|not now|do not|don't|skip|abort|never mind|nevermind|hold on|wait)\s*[.!]*\s*$/i.test(
    msg.trim(),
  );
}

export type ChatEvent =
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; ok: boolean; summary: string; result: unknown }
  | { type: "confirm_required"; riskLevel: string; plan: string }
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
1. Run ALL read operations automatically (status, log, diff, branch list) without asking.
2. Summarize what you found: modified files, untracked files, risks, recommended scope.
3. Propose the next write action clearly (e.g. "I'll stage all 4 modified files and generate a commit message. Shall I proceed?").
4. On user confirmation, execute the write action WITHOUT re-asking.
5. After each write action, automatically run the next read check, then propose the next step.
6. Continue until the goal is complete (PR created) or the user stops you.

## Autonomy table
| Operation | Autonomy |
|-----------|----------|
| git_status, git_log, git_diff, git_branch_list, git_remote, git_current_branch | Run immediately, no ask |
| git_add, git_stash | Run if user has confirmed OR explicitly requested; else propose first |
| git_commit | Propose commit message, ask once. On "yes" → execute |
| git_push | Propose once. On "yes" → execute |
| ado_create_pr, git_create_branch | Propose with title/target, ask once. On "yes" → execute |
| ado_trigger_pipeline | Always confirm explicitly |

## Tool selection guide
- To stage all changes: git_add (no paths = stage everything)
- To stage specific files: git_add with paths array
- To commit: git_commit with message
- To push: git_push with branch name
- To create a PR on Azure DevOps: ado_create_pr with source_branch, title, description
- To list branches: git_branch_list
- To check remotes: git_remote

## Risk Classification
- low    — read-only (status, diff, log, branch_list, remote)
- medium — git_add, git_commit, git_create_branch, git_stash
- high   — git_push, ado_create_pr, ado_trigger_pipeline

## MANDATORY Response Format
After completing your work, output ONLY this JSON on its own line (no other text after it):
{"response":"...","risk_level":"low|medium|high","actions_taken":["..."],"suggestions":[],"pending_action":{"tool":"...","args":{},"description":"...","nextHint":"..."}}

## MANDATORY pending_action Rules
- If your "response" text contains "Shall I", "Should I", "Do you want me to", "Ready to", or proposes a next action → YOU MUST set "pending_action" to the exact tool+args.
- DO NOT output "pending_action": null. Either include it as an object, or omit the key entirely.
- "pending_action".tool must be one of: git_add, git_commit, git_push, ado_create_pr, git_create_branch, git_stash.
- "pending_action".args must be the exact args you would pass to the tool if the user says yes.
- For git_add (stage all): {"tool":"git_add","args":{},"description":"Stage all changes","nextHint":"commit"}
- For git_commit: {"tool":"git_commit","args":{"message":"feat: <summary>"},"description":"Commit staged changes","nextHint":"push branch"}
- For git_push: {"tool":"git_push","args":{"branch":"<current-branch>"},"description":"Push branch to remote","nextHint":"create PR"}
- For ado_create_pr: {"tool":"ado_create_pr","args":{"source_branch":"<branch>","title":"<title>","description":"<body>"},"description":"Create pull request","nextHint":"done"}

## Examples
Proposing staging → pending_action REQUIRED:
{"response":"I found 4 modified files. Shall I stage all of them?","risk_level":"medium","actions_taken":["git_status"],"suggestions":[],"pending_action":{"tool":"git_add","args":{},"description":"Stage all changes","nextHint":"generate commit message"}}

After executing (no proposal) → no pending_action key:
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
  ): AsyncGenerator<ChatEvent> {
    if (!this.llm.configured) {
      yield* this._offlineFallback(message);
      return;
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      ...history.slice(-20).map(
        (m): ChatCompletionMessageParam => ({ role: m.role, content: m.content }),
      ),
      {
        role: "user",
        content: `Working directory: ${repoPath}\n\n${message}`,
      },
    ];

    const tools = this.executor.schemas();
    const toolCallsMade: ChatPlannerResult["toolCallsMade"] = [];
    let lastText = "";
    let confirmedOnce = false;

    for (let step = 0; step < this.maxSteps; step++) {
      let accumulated = "";
      let toolFromStream: import("./llm.js").ChatToolCall[] = [];

      try {
        for await (const ev of this.llm.chatStream({ messages, tools, maxTokens: 2000 })) {
          if (ev.type === "delta" && ev.delta) {
            accumulated += ev.delta;
            yield { type: "thinking", delta: ev.delta };
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
        const rawPending = parsed["pending_action"];
        const pendingAction: PendingToolAction | undefined =
          rawPending && typeof rawPending === "object"
            ? {
                tool: String((rawPending as Record<string, unknown>)["tool"] ?? ""),
                args: ((rawPending as Record<string, unknown>)["args"] as Record<string, unknown>) ?? {},
                description: String((rawPending as Record<string, unknown>)["description"] ?? ""),
                nextHint: String((rawPending as Record<string, unknown>)["nextHint"] ?? ""),
              }
            : undefined;

        // Risk gating: pause for confirmation on medium/high risk actions
        // that haven't been confirmed yet and haven't executed tools yet.
        if (
          !confirmedOnce &&
          (riskLevel === "medium" || riskLevel === "high") &&
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
            pendingAction: pendingAction?.tool ? pendingAction : undefined,
          },
        };
        return;
      }

      // No structured JSON yet — nudge the model
      messages.push({
        role: "user",
        content:
          'Please provide your final response as a single JSON line. If you are proposing a write action (stage/commit/push/PR), you MUST include pending_action. Format: {"response":"...","risk_level":"low|medium|high","actions_taken":[],"suggestions":[],"pending_action":{"tool":"git_add","args":{},"description":"...","nextHint":"..."}} — omit pending_action key only if you are NOT proposing any next action.',
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
