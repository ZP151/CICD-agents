import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { LLMUnavailableError, type LLMClient } from "./llm.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";
import type { ToolExecutor } from "./tools/executor.js";
import { toolCapabilities, toolCapabilityPrompt } from "./tools/capabilities.js";
import { chatAgentUseCasePrompt } from "./chatUseCases.js";

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
  readiness?: {
    kind: "push";
    status: "no_upstream" | "up_to_date" | "ahead" | "behind" | "diverged" | "unknown";
    upstream?: string;
    ahead?: number;
    behind?: number;
    summary: string;
  };
  preflight?:
    | {
        kind: "branch";
        action: "checkout" | "create";
        status: "current" | "local_exists" | "remote_only" | "missing" | "would_create" | "already_exists" | "invalid" | "unknown";
        branch: string;
        currentBranch?: string;
        localBranch?: string;
        remoteBranch?: string;
        summary: string;
      }
    | {
        kind: "pr";
        status: "ready" | "missing_ado_mapping" | "missing_source_branch" | "dirty_worktree" | "unknown";
        sourceBranch?: string;
        targetBranch?: string;
        repository?: string;
        project?: string;
        organization?: string;
        title?: string;
        summary: string;
      }
    | {
        kind: "validation";
        status: "ready" | "default_command" | "missing_command" | "unknown";
        validationKind: "test" | "build";
        command: string;
        commandSource: "override" | "profile" | "derived" | "default" | "artifact";
        changedFiles?: string[];
        changedFileCount?: number;
        selectedScript?: string;
        packageFilters?: string[];
        packageRoots?: string[];
        selectionReason?: string;
        summary: string;
      };
  workflow?: {
    kind: "commit" | "pr" | "git" | "ci";
    phase:
      | "stage"
      | "commit"
      | "push"
      | "test"
      | "build"
      | "pipeline_trigger"
      | "create"
      | "link_work_item"
      | "stage_conflicts"
      | "continue_rebase"
      | "abort_rebase"
      | "skip_rebase"
      | "continue_merge"
      | "abort_merge"
      | "continue_cherry_pick"
      | "abort_cherry_pick"
      | "skip_cherry_pick"
      | "continue_revert"
      | "abort_revert"
      | "skip_revert";
    branch?: string;
    message?: string;
    pushAfterCommit?: boolean;
  };
}

export interface ChatPlannerResult {
  response: string;
  streamedResponse?: string;
  finalizationMode?: "agent_final" | "control_marker" | "plain_json" | "none";
  riskLevel: string;
  actionsTaken: string[];
  suggestions: string[];
  sources?: ChatPlannerSource[];
  artifacts?: ChatPlannerArtifact[];
  toolCallsMade: Array<{ name: string; args: Record<string, unknown>; ok: boolean }>;
  usedLlm: boolean;
  approvalProposal?: PendingToolAction; // internal structured approval proposal for write actions
}

export interface ChatPlannerArtifact {
  type: "artifact";
  artifactId: string;
  title: string;
  artifactType: "react" | "html" | "markdown" | "mermaid" | "text";
  status: "streaming" | "ready" | "error";
  content?: string;
}

export type ChatPlannerSource =
  | {
      type: "source_document";
      sourceId?: string;
      title: string;
      file?: string;
      line?: number;
      snippet?: string;
    }
  | {
      type: "source_url";
      sourceId?: string;
      title: string;
      url: string;
      domain?: string;
      snippet?: string;
    };

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
  workflowKind?: "commit" | "git" | "ado" | "ci" | "pr";
  workflowPhase?: string;
  authStatus?: "ok" | "oauth_unavailable" | "oauth_no_org_access" | "pat_invalid_or_missing_scope" | "unknown_error";
  authMode?: "oauth" | "pat";
  authMessage?: string;
  retryable?: boolean;
  pendingApproval?: ChatApprovalRequest;
}

export const CHAT_CONTROL_JSON_MARKER = "__CONTROL_JSON__";
export const CHAT_FINAL_TOOL_NAME = "agent_final";

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
  | { type: "tool_start"; name: string; args: Record<string, unknown>; toolCallId?: string }
  | { type: "tool_output_delta"; name: string; stream: "stdout" | "stderr"; delta: string; toolCallId?: string }
  | { type: "tool_end"; name: string; ok: boolean; summary: string; result: unknown; toolCallId?: string }
  | { type: "confirm_required"; riskLevel: string; plan: string }
  | { type: "workflow_state"; state: ChatWorkflowState }
  | { type: "approval_required"; approval: ChatApprovalRequest }
  | { type: "approval_resolved"; approvalId: string; approved: boolean }
  | { type: "assistant_control"; control: ChatPlannerResult }
  | { type: "executing" }
  | { type: "message"; text: string }
  | { type: "done"; result: ChatPlannerResult }
  | { type: "error"; message: string }
  | { type: "cancelled" };

// ─── System prompt ────────────────────────────────────────────────────────────

export const CHAT_SYSTEM_PROMPT = `You are an autonomous MergePilot specializing in Git and CI/CD workflows. Your job is to EXECUTE operations on behalf of the developer, not just advise.

## Golden Rule: Continue what was proposed
If the user's message is a short affirmation — "yes", "proceed", "go ahead", "do it", "continue", "sure", "ok", "yeah", "yep", "y" — look at the PREVIOUS assistant message in the conversation and execute the action that was proposed there IMMEDIATELY. Do NOT ask for confirmation again. Do NOT restate what you're about to do. Just execute it.

## Workflow Orchestration
When the user asks you to help with a goal like "until PR", "from review to merge", "help me commit and push", understand this as a multi-step workflow:
1. Quickly understand the user's goal and the lightweight repository context provided in the user message when it is relevant.
2. Use project docs, file-structure signals, and profile settings when they help answer the request.
3. Run Git read operations automatically only when they are useful for the user's goal (status, log, diff, branch list).
4. When the user asks about current workspace changes, understand what the changes are about, not only which files changed. Prefer git_status with short=true, git_diff with context/path filters for unstaged working-tree changes, and git_diff with staged=true for staged changes. Do not use target_branch when reviewing uncommitted working-tree changes unless you also inspect the working-tree diff.
5. Summarize what you found: relevant code/docs, modified files, untracked files, risks, recommended scope.
6. Before proposing git_add, git_commit, or git_push, explain the concrete basis for the proposal: files inspected, important diff summary, exact paths/branch/message args, and why the scope is correct.
7. On user confirmation, execute the write action WITHOUT re-asking.
8. After each write action, use known context first, then run only the read checks needed for the next decision.
9. Continue only until the user's requested endpoint is complete. If the user asked for stage/commit/push, stop after push. Do not create PRs, link work items, or trigger pipelines unless the user explicitly asked for those steps.
10. If you call repo_refresh_index, treat it as a context-gathering step, not the final answer. Use the returned repositoryContextPrompt/contextSummary to answer the user's original request in the same turn. Do not ask the user to provide a high-level overview when repository context is available.

## Repository Context
The user message may include a "Repository context" section assembled from a quick project scan, project docs, file-structure signals, profile settings, and sometimes existing semantic index data. Treat this context as helpful local knowledge, not as a mandatory first step.
- For project understanding questions, use repository context when it is relevant and sufficient.
- Do not call Git tools or force repository-index assumptions just because tools/context are available.
- Call Git tools when the user asks about current changes, branch state, commit/PR workflow, or when repository context says changed files are relevant.
- If repository context is insufficient, use safe read-only tools to gather missing facts.
- If repo_refresh_index returns repositoryContextPrompt, rely on it as fresh repository context for the current turn.
- When finalizing a response with project-specific claims, include source_document entries for relevant files or repository context. When finalizing a response based on external documentation or web search, include source_url entries.

## Answer Scope And Brevity
- Answer only the user's current request. Do not add adjacent workflow sections, PR advice, CI/CD plans, or development-process commentary unless the user explicitly asks for them.
- For "explain architecture", focus on purpose, major layers/modules, important integrations, and data flow. Do not include "Development Workflow", "Next steps", or Git/PR/CI/CD sections unless requested.
- Default to a concise answer: 3-6 short bullets or 2-4 short paragraphs. Use longer structure only when the user asks for a detailed review, plan, or exhaustive analysis.
- If the answer is based on repository context, cite sources through final metadata instead of expanding long excerpts in the prose.

## Autonomy table
| Operation | Autonomy |
|-----------|----------|
| Registered read-only tools | Run immediately when useful |
| Registered write tools | Propose an approval_proposal with exact args before execution |
| Medium/high risk write tools | Runtime requires approval before execution |
| Destructive or remote-changing tools | Always require explicit approval |

## Tool selection guide
- Use the Available tool capabilities registry as the source of truth.
- Do not invent tool names.
- Do not assume every workflow must stage, commit, push, and create a PR.
- For a proposed next action, choose the registered write tool that directly matches the user's goal.
- Fill required arguments exactly as the tool schema requires.
- For git_add, pass paths whenever the changed file list is known. Use an empty args object only after explaining why every changed path should be staged.
- Use structured Git tool arguments for common flags instead of asking the user to run raw commands. Examples: git_status {"short":true}, git_diff {"staged":true}, git_diff {"name_only":true}, git_add {"paths":["src/file.ts"]}, git_commit {"message":"...","noVerify":true}, git_switch {"branch":"feature/x","create":true}.

## Core Chat Agent Use Cases
${chatAgentUseCasePrompt()}

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

## MANDATORY Finalization Protocol
Prefer the \`${CHAT_FINAL_TOOL_NAME}\` tool for the final response metadata.
Call \`${CHAT_FINAL_TOOL_NAME}\` exactly once when you are ready to finish the turn.
Pass the user-facing response, risk_level, actions_taken, suggestions, and optional approval_proposal as tool arguments.

Compatibility fallback only: if tool calling is unavailable, stream the user-facing response first as normal prose, then output exactly one final control line beginning with ${CHAT_CONTROL_JSON_MARKER} followed by JSON:
${CHAT_CONTROL_JSON_MARKER}{"response":"same user-facing response text","risk_level":"low|medium|high","actions_taken":["..."],"suggestions":[],"approval_proposal":{"tool":"...","args":{},"description":"...","nextHint":"..."}}

Never show JSON before the ${CHAT_CONTROL_JSON_MARKER} line.

## MANDATORY approval_proposal Rules
- If your "response" text contains "Shall I", "Should I", "Do you want me to", "Ready to", or proposes a next write action → YOU MUST set "approval_proposal" to the exact tool+args.
- DO NOT output "approval_proposal": null. Either include it as an object, or omit the key entirely.
- "approval_proposal".tool must be a registered write tool from the Available tool capabilities registry.
- "approval_proposal".args must be the exact args you would pass to the tool if the user says yes.
- Include a concise "description" and, when helpful, a "nextHint" for the continuation step.
- If the user goal does not require another write action, omit "approval_proposal".

## Examples
Proposing staging → call \`${CHAT_FINAL_TOOL_NAME}\` with approval_proposal:
{"response":"I found 4 modified files. Shall I stage all of them?","risk_level":"medium","actions_taken":["git_status"],"suggestions":[],"approval_proposal":{"tool":"git_add","args":{},"description":"Stage all changes","nextHint":"generate commit message"}}

After executing → call \`${CHAT_FINAL_TOOL_NAME}\` without approval_proposal:
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

    const registeredTools = this.executor.list();
    const tools = [
      ...registeredTools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      finalizationToolSchema(),
    ];
    const capabilitiesByName = new Map(
      toolCapabilities(registeredTools).map((cap) => [cap.name, cap]),
    );
    const toolCallsMade: ChatPlannerResult["toolCallsMade"] = [];
    let lastText = "";
    let confirmedOnce = false;
    // Track consecutive failures of the same tool to prevent infinite retry loops.
    let lastFailedTool = "";
    let consecutiveFailCount = 0;

    for (let step = 0; step < this.maxSteps; step++) {
      let accumulated = "";
      let emittedVisibleResponse = "";
      let toolFromStream: import("./llm.js").ChatToolCall[] = [];

      try {
        for await (const ev of this.llm.chatStream({ messages, tools, maxTokens: 2000 })) {
          if (ev.type === "delta" && ev.delta) {
            accumulated += ev.delta;
            const visibleResponse = extractVisibleStreamingResponse(accumulated);
            if (visibleResponse && visibleResponse.length > emittedVisibleResponse.length) {
              const delta = visibleResponse.slice(emittedVisibleResponse.length);
              emittedVisibleResponse = visibleResponse;
              yield { type: "assistant_delta", delta };
            }
          } else if (ev.type === "tool_call_delta" && ev.toolCalls) {
            const finalizationCall = ev.toolCalls.find((tc) => tc.name === CHAT_FINAL_TOOL_NAME);
            if (finalizationCall?.arguments) {
              const visibleResponse = extractVisibleStreamingResponse(finalizationCall.arguments);
              if (visibleResponse && visibleResponse.length > emittedVisibleResponse.length) {
                const delta = visibleResponse.slice(emittedVisibleResponse.length);
                emittedVisibleResponse = visibleResponse;
                yield { type: "assistant_delta", delta };
              }
            }
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
        const finalizationCalls = toolFromStream.filter((tc) => tc.name === CHAT_FINAL_TOOL_NAME);
        const executableToolCalls = toolFromStream.filter((tc) => tc.name !== CHAT_FINAL_TOOL_NAME);

        if (finalizationCalls.length > 0 && executableToolCalls.length === 0) {
          const finalCall = finalizationCalls[finalizationCalls.length - 1]!;
          const args = parseToolArguments(finalCall.arguments);
          const result = plannerResultFromControl(args, {
            visibleText: accumulated,
            fallbackText: accumulated,
            finalizationMode: "agent_final",
            streamedResponse: emittedVisibleResponse || undefined,
            toolCallsMade,
            usedLlm: true,
          });
          yield { type: "assistant_control", control: result };
          yield { type: "done", result };
          return;
        }

        if (finalizationCalls.length > 0) {
          yield {
            type: "progress",
            message: "Continuing tool execution before finalizing the assistant turn.",
          };
        }

        messages.push({
          role: "assistant",
          content: accumulated || null,
          tool_calls: executableToolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });

        for (const tc of executableToolCalls) {
          const args = parseToolArguments(tc.arguments);
          const capability = capabilitiesByName.get(tc.name);
          const outOfScope = outOfScopeWriteMessage(tc.name, message, history);
          if (outOfScope) {
            const result: ChatPlannerResult = {
              response: outOfScope,
              finalizationMode: "none",
              riskLevel: "low",
              actionsTaken: toolCallsMade.map((t) => t.name),
              suggestions: [],
              toolCallsMade,
              usedLlm: true,
            };
            yield { type: "done", result };
            return;
          }

          const inspectionGuidance = requiredChangeInspectionGuidance(
            tc.name,
            args,
            message,
            history,
            toolCallsMade,
          );
          if (inspectionGuidance) {
            yield { type: "progress", message: inspectionGuidance };
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ ok: false, guidance: inspectionGuidance }),
            });
            continue;
          }

          if (capability?.requiresApproval) {
            const description = approvalDescription(capability.description, tc.name);
            yield {
              type: "done",
              result: {
                response:
                  `The \`${tc.name}\` tool requires approval before I can run it. ` +
                  `Shall I proceed with ${description}?`,
                riskLevel: capability.riskLevel,
                actionsTaken: toolCallsMade.map((t) => t.name),
                suggestions: [],
                toolCallsMade,
                usedLlm: true,
                approvalProposal: {
                  tool: tc.name,
                  args,
                  description,
                  nextHint: "continue workflow",
                },
              },
            };
            return;
          }

          yield { type: "tool_start", name: tc.name, args, toolCallId: tc.id };
          let toolResult: unknown;
          let ok = true;
          try {
            for await (const streamEvent of this.executor.callStream(tc.name, args)) {
              if (streamEvent.type === "output") {
                yield {
                  type: "tool_output_delta",
                  name: tc.name,
                  stream: streamEvent.stream,
                  delta: streamEvent.text,
                  toolCallId: tc.id,
                };
              } else {
                toolResult = streamEvent.result;
              }
            }
          } catch (err) {
            ok = false;
            toolResult = { error: err instanceof Error ? err.message : String(err) };
          }
          const summary = summarizeToolResult(toolResult, ok);
          yield { type: "tool_end", name: tc.name, ok, summary, result: toolResult, toolCallId: tc.id };
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

      const control = parseControlResponse(lastText);
      const parsed = control.control;
      if (parsed) {
        const result = plannerResultFromControl(parsed, {
          visibleText: control.visibleText,
          fallbackText: lastText,
          finalizationMode: control.mode,
          streamedResponse: emittedVisibleResponse || undefined,
          toolCallsMade,
          usedLlm: true,
        });
        const riskLevel = result.riskLevel;
        const response = result.response;
        const approvalProposal = result.approvalProposal;

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
          type: "assistant_control",
          control: result,
        };
        yield { type: "done", result };
        return;
      }

      // No structured JSON yet — nudge the model
      messages.push({
        role: "user",
        content:
          `Call the ${CHAT_FINAL_TOOL_NAME} tool now with response, risk_level, actions_taken, suggestions, and any approval_proposal. If you are proposing a write action, approval_proposal is required. Only if tool calling is unavailable, use the compatibility fallback line starting with ${CHAT_CONTROL_JSON_MARKER}.`,
      });
    }

    // Step limit reached — return whatever we have
    logger().warn({ step: this.maxSteps }, "chat planner hit step limit");
    yield {
      type: "done",
      result: {
        response: lastText || "(no response)",
        streamedResponse: undefined,
        finalizationMode: "none",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [],
        toolCallsMade,
        usedLlm: true,
      },
    };
  }

  private async *_offlineFallback(message: string): AsyncGenerator<ChatEvent> {
    const requested = summarizeOfflineRequest(message);
    const response =
      `Selected model is temporarily unavailable, so I did not infer or execute a Git/PR workflow.\n\n` +
      `Request: ${requested}\n\n` +
      `Use a structured Conversation action such as Review changes, Branch status, PR insight, ` +
      `or restore the model connection so I can inspect current repository state and choose exact tool arguments.`;
    yield { type: "message", text: response };
    yield {
      type: "done",
      result: {
        response,
        streamedResponse: undefined,
        finalizationMode: "none",
        riskLevel: "low",
        actionsTaken: [],
        suggestions: [
          "Review changes",
          "Check branch status",
          "Restore model connection",
        ],
        toolCallsMade: [],
        usedLlm: false,
      },
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function summarizeOfflineRequest(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (!trimmed) return "No user request was available.";
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
}

function finalizationToolSchema() {
  return {
    type: "function" as const,
    function: {
      name: CHAT_FINAL_TOOL_NAME,
      description:
        "Finalize the assistant turn with typed runtime metadata. Use this instead of writing control JSON in text.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["response", "risk_level", "actions_taken", "suggestions"],
        properties: {
          response: {
            type: "string",
            description: "The complete user-facing response text.",
          },
          risk_level: {
            type: "string",
            enum: ["low", "medium", "high"],
          },
          actions_taken: {
            type: "array",
            items: { type: "string" },
          },
          suggestions: {
            type: "array",
            items: { type: "string" },
          },
          sources: {
            type: "array",
            description:
              "Optional source references used by the final answer. Use source_document for repository files or indexed documents, and source_url for external web or documentation references.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["type", "title"],
              properties: {
                type: {
                  type: "string",
                  enum: ["source_document", "source_url"],
                },
                sourceId: { type: "string" },
                title: { type: "string" },
                file: { type: "string" },
                line: { type: "number" },
                snippet: { type: "string" },
                url: { type: "string" },
                domain: { type: "string" },
              },
            },
          },
          approval_proposal: {
            type: "object",
            additionalProperties: false,
            required: ["tool", "args", "description"],
            properties: {
              tool: { type: "string" },
              args: { type: "object", additionalProperties: true },
              description: { type: "string" },
              nextHint: { type: "string" },
            },
          },
        },
      },
    },
  };
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

function requiredChangeInspectionGuidance(
  toolName: string,
  args: Record<string, unknown>,
  message: string,
  history: ChatMessage[],
  toolCallsMade: ChatPlannerResult["toolCallsMade"],
): string {
  if (!["git_add", "git_commit", "git_push"].includes(toolName)) return "";
  const lower = userScopeText(message, history).toLowerCase();
  if (!/\b(change|changes|stage|commit|push|review|diff|working tree|workspace)\b/.test(lower)) return "";

  const executed = new Set(toolCallsMade.filter((call) => call.ok).map((call) => call.name));
  const hasStatus = executed.has("git_status");
  const hasDiff = executed.has("git_diff") || executed.has("git_show");

  if (toolName === "git_add" && (!hasStatus || !hasDiff)) {
    const hasPaths = Array.isArray(args["paths"]) && args["paths"].length > 0;
    return hasPaths
      ? "Inspect current changes with git_status and git_diff before requesting approval to stage selected paths."
      : "Inspect current changes with git_status and git_diff, then propose git_add with exact paths or explain why all changed paths should be staged.";
  }

  if (toolName === "git_commit" && !executed.has("git_add") && !historyMentionsExecuted(history, "git_add")) {
    return "Verify staged content with git_status and git_diff staged=true before requesting approval to commit.";
  }

  if (toolName === "git_push" && !executed.has("git_commit") && !historyMentionsExecuted(history, "git_commit")) {
    return "Do not push until the requested commit has been created; inspect current branch/status and propose the commit step first.";
  }

  return "";
}

function outOfScopeWriteMessage(
  toolName: string,
  message: string,
  history: ChatMessage[],
): string {
  const scope = userScopeText(message, history).toLowerCase();
  if (toolName === "ado_create_pr" && !/\b(pr|pull request)\b/.test(scope)) {
    return "The requested workflow scope does not include creating a pull request. I will stop at the requested Git workflow boundary unless you explicitly ask me to create a PR.";
  }
  if (/work_item|workitem/.test(toolName) && !/\b(work item|workitem|user story|task|bug|link)\b/.test(scope)) {
    return "The requested workflow scope does not include linking work items, and no work item was explicitly selected. I will not link a work item unless you ask for it and provide or select the work item.";
  }
  if (toolName === "ado_trigger_pipeline" && !/\b(pipeline|build|run ci|trigger)\b/.test(scope)) {
    return "The requested workflow scope does not include triggering a pipeline. I will not run the pipeline unless you explicitly ask for it.";
  }
  return "";
}

function userScopeText(message: string, history: ChatMessage[]): string {
  const userHistory = history
    .filter((entry) => entry.role === "user")
    .map((entry) => entry.content)
    .join("\n");
  return `${userHistory}\n${message}`;
}

function historyMentionsExecuted(history: ChatMessage[], toolName: string): boolean {
  const marker = `[executed] ${toolName}`;
  const confirmedMarker = `[confirmed & executed] ${toolName}`;
  return history.some((entry) =>
    entry.role === "assistant" &&
    (entry.content.includes(marker) || entry.content.includes(confirmedMarker))
  );
}

function plannerResultFromControl(
  control: Record<string, unknown>,
  opts: {
    visibleText?: string;
    fallbackText: string;
    finalizationMode: ChatPlannerResult["finalizationMode"];
    streamedResponse?: string;
    toolCallsMade: ChatPlannerResult["toolCallsMade"];
    usedLlm: boolean;
  },
): ChatPlannerResult {
  const rawApprovalProposal = control["approval_proposal"] ?? control["pending_action"];
  const approvalProposal = pendingActionFromControl(rawApprovalProposal);
  return {
    response: String(control["response"] ?? opts.visibleText ?? opts.fallbackText),
    streamedResponse: opts.streamedResponse,
    finalizationMode: opts.finalizationMode,
    riskLevel: String(control["risk_level"] ?? control["riskLevel"] ?? "low"),
    actionsTaken: arrayOfStrings(control["actions_taken"] ?? control["actionsTaken"]),
    suggestions: arrayOfStrings(control["suggestions"]),
    sources: normalizeSources(control["sources"]),
    artifacts: normalizeArtifacts(control["artifacts"]),
    toolCallsMade: opts.toolCallsMade,
    usedLlm: opts.usedLlm,
    approvalProposal: approvalProposal?.tool ? approvalProposal : undefined,
  };
}

function pendingActionFromControl(raw: unknown): PendingToolAction | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    // Strip legacy "functions." prefix that some LLMs emit (e.g. functions.git_commit)
    tool: String(obj["tool"] ?? "").replace(/^functions\./, ""),
    args: (obj["args"] as Record<string, unknown>) ?? {},
    description: String(obj["description"] ?? ""),
    nextHint: obj["nextHint"] === undefined ? undefined : String(obj["nextHint"]),
    readiness: obj["readiness"] as PendingToolAction["readiness"],
    preflight: obj["preflight"] as PendingToolAction["preflight"],
    workflow: obj["workflow"] as PendingToolAction["workflow"],
  };
}

function arrayOfStrings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map(String) : [];
}

function normalizeSources(raw: unknown): ChatPlannerSource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const sources = raw
    .map((item, index): ChatPlannerSource | null => {
      if (!item || typeof item !== "object") return null;
      const source = item as Record<string, unknown>;
      const title = stringValue(source["title"]) || stringValue(source["file"]) || stringValue(source["url"]);
      if (!title) return null;

      if (source["type"] === "source_url") {
        const url = stringValue(source["url"]);
        if (!url) return null;
        return {
          type: "source_url",
          sourceId: stringValue(source["sourceId"]) || `url-${index}`,
          title,
          url,
          domain: stringValue(source["domain"]),
          snippet: stringValue(source["snippet"]),
        };
      }

      if (source["type"] !== "source_document") return null;
      const line = typeof source["line"] === "number" && Number.isFinite(source["line"])
        ? source["line"]
        : undefined;
      return {
        type: "source_document",
        sourceId: stringValue(source["sourceId"]) || `document-${index}`,
        title,
        file: stringValue(source["file"]),
        line,
        snippet: stringValue(source["snippet"]),
      };
    })
    .filter((source): source is ChatPlannerSource => Boolean(source));
  return sources.length ? sources : undefined;
}

function normalizeArtifacts(raw: unknown): ChatPlannerArtifact[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const artifacts = raw
    .map((item): ChatPlannerArtifact | null => {
      if (!item || typeof item !== "object") return null;
      const artifact = item as Record<string, unknown>;
      const artifactId = String(artifact["artifactId"] ?? artifact["artifact_id"] ?? "").trim();
      const title = String(artifact["title"] ?? "").trim();
      const artifactType = artifact["artifactType"] ?? artifact["artifact_type"];
      const status = artifact["status"];
      if (!artifactId || !title) return null;
      if (!["react", "html", "markdown", "mermaid", "text"].includes(String(artifactType))) return null;
      if (!["streaming", "ready", "error"].includes(String(status))) return null;
      const content = typeof artifact["content"] === "string" ? artifact["content"] : undefined;
      return {
        type: "artifact",
        artifactId,
        title,
        artifactType: artifactType as ChatPlannerArtifact["artifactType"],
        status: status as ChatPlannerArtifact["status"],
        content,
      };
    })
    .filter((artifact): artifact is ChatPlannerArtifact => Boolean(artifact));
  return artifacts.length ? artifacts : undefined;
}

function stringValue(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

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

function parseControlResponse(text: string): {
  visibleText?: string;
  control: Record<string, unknown> | null;
  mode: ChatPlannerResult["finalizationMode"];
} {
  const markerIndex = text.lastIndexOf(CHAT_CONTROL_JSON_MARKER);
  if (markerIndex !== -1) {
    const visibleText = text.slice(0, markerIndex).trim();
    const afterMarker = text.slice(markerIndex + CHAT_CONTROL_JSON_MARKER.length).trim();
    const control = parseFinalJson(afterMarker);
    return { visibleText, control, mode: "control_marker" };
  }
  return { control: parseFinalJson(text), mode: "plain_json" };
}

function extractVisibleStreamingResponse(text: string): string {
  const markerIndex = text.indexOf(CHAT_CONTROL_JSON_MARKER);
  if (markerIndex !== -1) return text.slice(0, markerIndex);
  const responseField = extractStreamingJsonStringField(text, "response");
  if (responseField) return responseField;
  if (looksLikeStructuredJsonPrefix(text)) return "";
  return trimPotentialControlMarkerPrefix(text);
}

function looksLikeStructuredJsonPrefix(text: string): boolean {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("{")) return false;
  return (
    trimmed.includes("\"response\"") ||
    trimmed.includes("\"risk_level\"") ||
    trimmed.includes("\"approval_proposal\"") ||
    trimmed.includes("\"actions_taken\"")
  );
}

function trimPotentialControlMarkerPrefix(text: string): string {
  const max = Math.min(text.length, CHAT_CONTROL_JSON_MARKER.length - 1);
  for (let len = max; len > 0; len--) {
    if (CHAT_CONTROL_JSON_MARKER.startsWith(text.slice(-len))) {
      return text.slice(0, -len);
    }
  }
  return text;
}

function extractStreamingJsonStringField(text: string, field: string): string {
  const key = `"${field}"`;
  const keyIndex = text.indexOf(key);
  if (keyIndex === -1) return "";
  const colonIndex = text.indexOf(":", keyIndex + key.length);
  if (colonIndex === -1) return "";

  let quoteIndex = -1;
  for (let i = colonIndex + 1; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch ?? "")) continue;
    if (ch !== "\"") return "";
    quoteIndex = i;
    break;
  }
  if (quoteIndex === -1) return "";

  let out = "";
  for (let i = quoteIndex + 1; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === "\"") return out;
    if (ch !== "\\") {
      out += ch;
      continue;
    }

    if (i + 1 >= text.length) return out;
    const esc = text[++i]!;
    if (esc === "\"" || esc === "\\" || esc === "/") out += esc;
    else if (esc === "b") out += "\b";
    else if (esc === "f") out += "\f";
    else if (esc === "n") out += "\n";
    else if (esc === "r") out += "\r";
    else if (esc === "t") out += "\t";
    else if (esc === "u") {
      const hex = text.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return out;
      out += String.fromCharCode(Number.parseInt(hex, 16));
      i += 4;
    }
  }
  return out;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function summarizeToolResult(result: unknown, ok: boolean): string {
  const text = typeof result === "string"
    ? result
    : result && typeof result === "object" && "error" in result
      ? String((result as { error?: unknown }).error ?? "")
      : JSON.stringify(result);
  const readable = summarizeKnownRuntimeError(text);
  return ok ? truncate(readable, 200) : `error: ${truncate(readable, 220)}`;
}

function summarizeKnownRuntimeError(text: string): string {
  if (/Could not locate the bindings file/i.test(text) || /better_sqlite3\.node/i.test(text)) {
    return "Repository index storage is unavailable because the installed daemon could not load its native SQLite binding.";
  }
  if (/schema\.sql/i.test(text) && /ENOENT|no such file|cannot find/i.test(text)) {
    return "Repository index storage is unavailable because the installed daemon could not find its database schema.";
  }
  return text.replace(/\s*[-=]{2,}\s*$/g, "").trim();
}

function approvalDescription(description: string, fallbackName: string): string {
  const trimmed = description.trim();
  if (!trimmed) return fallbackName.replace(/_/g, " ");
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}
