import { LLMUnavailableError, type LLMClient } from "./llm.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";
import type { ToolExecutor } from "./tools/executor.js";
import {
  approvalDescription,
  CHAT_CONTROL_JSON_MARKER,
  CHAT_FINAL_TOOL_NAME,
  parseControlResponse,
  parseToolArguments,
  plannerResultFromControl,
  truncate,
} from "./chatPlannerControl.js";
import {
  guardReviewOnlyFinalResult,
  isExplicitReadOnlyRequest,
  outOfScopeWriteMessage,
  requiredChangeInspectionGuidance,
  requiredRepositoryStateEvidenceGuidance,
} from "./chatPlannerGuards.js";
import { offlineFallbackEvents } from "./chatPlannerOffline.js";
import {
  buildPlannerMessages,
  buildPlannerToolSchemas,
  buildToolCapabilitiesByName,
} from "./chatPlannerRequest.js";
import { collectPlannerStepStream } from "./chatPlannerStepStream.js";
import {
  executePlannerToolCall,
  repeatedToolFailureResult,
  updateToolFailureTracker,
} from "./chatPlannerToolExecution.js";
import { streamActionNarrative } from "./chatPublicOpening.js";
import { finalEvidenceReferences, groundFinalResponse, type PublicToolEvidence } from "./chatPlannerEvidence.js";
import { CallDedupGate } from "./toolCallDedup.js";
import type {
  ChatEvent,
  ChatImageAttachment,
  ChatMessage,
  ChatPlannerResult,
} from "./chatPlannerTypes.js";

export type {
  ChatApprovalRequest,
  ChatEvent,
  ChatEventFailure,
  ChatImageAttachment,
  ChatMessage,
  ChatPlannerArtifact,
  ChatPlannerResult,
  ChatPlannerSource,
  ChatWorkflowState,
  PendingToolAction,
} from "./chatPlannerTypes.js";
export { CHAT_CONTROL_JSON_MARKER, CHAT_FINAL_TOOL_NAME } from "./chatPlannerControl.js";
export { CHAT_SYSTEM_PROMPT } from "./chatPlannerPrompt.js";
export { isConfirmationMessage, isDenialMessage } from "./chatPlannerAffirmation.js";

export class ChatPlanner {
  private readonly maxSteps: number;

  constructor(
    private readonly llm: LLMClient,
    private readonly executor: ToolExecutor,
    opts: { maxSteps?: number } = {},
  ) {
    this.maxSteps = opts.maxSteps ?? getSettings().plannerMaxSteps;
  }

  /** Run one conversational turn. */
  async *run(
    message: string,
    history: ChatMessage[],
    repoPath: string,
    waitForConfirm: () => Promise<boolean>,
    contextPrompt?: string,
    imageAttachments: ChatImageAttachment[] = [],
    initialNarrative?: string,
    actionNarrativesEnabled = false,
    initialNarrativeInFlight = false,
    /**
     * The Turn runtime may prepare this planner in parallel with a dedicated
     * public narrator. Planning is side-effect free, but a real tool must not
     * begin before the corresponding public action narrative is visible.
     */
    beforeFirstTool?: Promise<void>,
  ): AsyncGenerator<ChatEvent> {
    if (!this.llm.configured) {
      yield* offlineFallbackEvents(message);
      return;
    }

    const allRegisteredTools = this.executor.list();
    // An explicit read-only request is a hard safety boundary. Narrowing the
    // tool schema to that boundary also removes dozens of irrelevant write
    // descriptions from the first model request, making Project Link
    // inspections faster without relying on keyword-derived commands.
    const allCapabilities = buildToolCapabilitiesByName(allRegisteredTools);
    const registeredTools = isExplicitReadOnlyRequest(message)
      ? allRegisteredTools.filter((tool) => allCapabilities.get(tool.name)?.readOnly)
      : allRegisteredTools;
    const messages = buildPlannerMessages({
      message,
      history,
      repoPath,
      contextPrompt,
      tools: registeredTools,
      imageAttachments,
    });
    if (initialNarrative?.trim()) {
      messages.push({ role: "assistant", content: initialNarrative.trim() });
    }
    const tools = buildPlannerToolSchemas(registeredTools);
    const capabilitiesByName = buildToolCapabilitiesByName(registeredTools);
    const toolCallsMade: ChatPlannerResult["toolCallsMade"] = [];
    const publicToolEvidence: PublicToolEvidence[] = [];
    // MP-002: one turn never repeats an equivalent completed read-only call.
    const dedupGate = new CallDedupGate();
    const toolBudget = getSettings().plannerToolBudget;
    let lastText = "";
    let streamedVisibleResponse = "";
    let confirmedOnce = false;
    let firstToolGate = beforeFirstTool;
    // Track consecutive failures of the same tool to prevent infinite retry loops.
    let toolFailureTracker = { lastFailedTool: "", consecutiveFailCount: 0 };

    for (let step = 0; step < this.maxSteps; step++) {
      // The first action narrative is started by the Turn runtime before
      // Project Link/context setup. Later narrations are deliberately *not*
      // emitted until this planner has selected a real subsequent tool batch:
      // otherwise a model would narrate a hypothetical next action even when
      // it is about to finalize, creating the repeated prose seen in the
      // former execution transcript.
      if (actionNarrativesEnabled && step === 0 && !initialNarrative?.trim() && !initialNarrativeInFlight) {
        const evidence = actionNarrativeEvidence(messages);
        for await (const event of streamActionNarrative(this.llm, {
          request: message,
          evidence,
          blockId: `narrative-${step}`,
        })) {
          yield event;
        }
      }
      let streamResult;
      try {
        streamResult = yield* collectPlannerStepStream(
          this.llm,
          messages,
          tools,
          streamedVisibleResponse,
          plannerReasoningEffort(message, step),
        );
      } catch (err) {
        if (err instanceof LLMUnavailableError) {
          yield { type: "error", message: "LLM became unavailable mid-stream." };
          return;
        }
        throw err;
      }
      const { accumulated, emittedVisibleResponse, toolFromStream } = streamResult;
      streamedVisibleResponse = emittedVisibleResponse;

      // ── Tool calls ──────────────────────────────────────────────────────────
      if (toolFromStream.length > 0) {
        const finalizationCalls = toolFromStream.filter((tc) => tc.name === CHAT_FINAL_TOOL_NAME);
        const executableToolCalls = toolFromStream.filter((tc) => tc.name !== CHAT_FINAL_TOOL_NAME);

        if (finalizationCalls.length > 0 && executableToolCalls.length === 0) {
          const finalCall = finalizationCalls[finalizationCalls.length - 1]!;
          const args = parseToolArguments(finalCall.arguments);
          // A tool schema's `required` field only guarantees that a provider
          // supplied the key. GPT tool calls can still contain `response: ""`.
          // Treat that as an incomplete finalization instead of sealing a Turn
          // with no visible conclusion (and therefore no copy/footer UI).
          if (!hasUserFacingFinalResponse(args, accumulated)) {
            messages.push({
              role: "assistant",
              content: accumulated || null,
              tool_calls: [{
                id: finalCall.id,
                type: "function" as const,
                function: { name: finalCall.name, arguments: finalCall.arguments },
              }],
            });
            messages.push({
              role: "tool",
              tool_call_id: finalCall.id,
              content: JSON.stringify({
                ok: false,
                error: "agent_final.response must contain a concise user-facing conclusion. Call agent_final again with non-empty response text.",
              }),
            });
            continue;
          }
          const result = withGroundedToolEvidence(guardReviewOnlyFinalResult(
            plannerResultFromControl(args, {
              visibleText: accumulated,
              fallbackText: accumulated,
              finalizationMode: "agent_final",
              streamedResponse: emittedVisibleResponse || undefined,
              toolCallsMade,
              usedLlm: true,
            }),
            message,
          ), publicToolEvidence);
          yield { type: "assistant_control", control: result };
          yield { type: "done", result };
          return;
        }

        if (actionNarrativesEnabled && step > 0 && executableToolCalls.length > 0) {
          const evidence = actionNarrativeEvidence(messages);
          const plannedAction = publicPlannedAction(executableToolCalls, capabilitiesByName);
          for await (const event of streamActionNarrative(this.llm, {
            request: message,
            evidence,
            plannedAction,
            blockId: `narrative-${step}`,
          })) {
            yield event;
          }
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

        let activeReadOnlyGroupId: string | undefined;
        let firstExecutableWasReadOnly = false;
        for (const [toolCallIndex, tc] of executableToolCalls.entries()) {
          const args = parseToolArguments(tc.arguments);
          const capability = capabilitiesByName.get(tc.name);
          // A provider can emit a stale or hallucinated tool name even when
          // it was not present in this request's schema. Treat the advertised
          // capability set as an execution boundary, especially after a
          // read-only turn narrowed the available tools for latency.
          if (!capability) {
            if (isExplicitReadOnlyRequest(message)) {
              const result: ChatPlannerResult = {
                response: "This turn is explicitly read-only, so I will not propose or run a repository-changing action. I will stop after the evidence collected so far.",
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
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({
                ok: false,
                unavailable: true,
                guidance: `The requested tool ${tc.name} was not available for this decision. Choose an advertised tool instead.`,
              }),
            });
            continue;
          }
          // One planner decision may safely run several read-only tools. They
          // share one public statement and one transcript group, but the first
          // write/unknown tool after it is deferred for a fresh decision.
          const canJoinReadOnlyBatch = toolCallIndex === 0
            || (firstExecutableWasReadOnly && capability?.readOnly === true);
          if (!canJoinReadOnlyBatch) {
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({
                ok: false,
                deferred: true,
                guidance:
                  "This command was intentionally deferred. Re-evaluate after the preceding tool result before selecting the next executable action.",
              }),
            });
            continue;
          }
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

          const repositoryStateGuidance = requiredRepositoryStateEvidenceGuidance(
            tc.name,
            message,
            history,
            toolCallsMade,
          );
          if (repositoryStateGuidance) {
            yield { type: "progress", message: repositoryStateGuidance };
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({ ok: false, deferred: true, guidance: repositoryStateGuidance }),
            });
            continue;
          }

          if (capability?.requiresApproval) {
            if (isExplicitReadOnlyRequest(message)) {
              const result: ChatPlannerResult = {
                response: "This turn is explicitly read-only, so I will not propose or run a repository-changing action. I will stop after the evidence collected so far.",
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
            const description = approvalDescription(capability.description, tc.name);
            // The public action narrative was already streamed by the model
            // before this decision. The approval activity carries the formal
            // action description; emitting another capability-derived work
            // statement here would look like fabricated agent reasoning.
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

          const actionLabel = publicToolActionLabel(capability?.description, tc.name);
          // Do not merely buffer the UI event: preserve the causal contract
          // that a user-visible action narrative precedes the real command.
          // This lets the main LLM plan concurrently with the narrator while
          // keeping command execution truthful and ordered.
          if (firstToolGate) {
            await firstToolGate;
            firstToolGate = undefined;
          }
          if (!activeReadOnlyGroupId) {
            activeReadOnlyGroupId = tc.id;
            firstExecutableWasReadOnly = capability?.readOnly === true;
            yield {
              type: "tool_group_start",
              groupId: activeReadOnlyGroupId,
              connector: capability?.connector,
            };
          }
          const dedup = dedupGate.propose(tc.name, args);
          if (dedup.decision === "suppress" && dedup.suppressedByCallId) {
            // RA-006: the UI marks the suppression instead of faking success;
            // the model still receives an explicit tool result so it can move on.
            yield {
              type: "progress",
              message: `Skipped repeated equivalent call to ${tc.name} (no new state; earlier call ${dedup.suppressedByCallId}).`,
            };
            yield { type: "turn_step", stepId: tc.id, status: "blocked", label: `Suppressed repeated call: ${actionLabel}` };
            toolCallsMade.push({ name: tc.name, args, ok: true, suppressed: true });
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({
                ok: true,
                suppressed: true,
                reason: `An equivalent call to ${tc.name} already completed this turn as call ${dedup.suppressedByCallId}. No new state was requested. If the repo state changed, make that explicit and re-run.`,
                previousCallId: dedup.suppressedByCallId,
              }),
            });
            continue;
          }
          yield { type: "turn_step", stepId: tc.id, status: "started", label: actionLabel };
          const { ok, toolResult, output } = yield* executePlannerToolCall(this.executor, tc, args);
          yield {
            type: "turn_step",
            stepId: tc.id,
            status: ok ? "completed" : "blocked",
            label: ok ? actionLabel : `Could not complete: ${actionLabel}`,
          };
          toolCallsMade.push({ name: tc.name, args, ok });
          publicToolEvidence.push({ name: tc.name, ok, output, callId: tc.id });
          if (ok) {
            if (capability?.readOnly === true) {
              dedupGate.recordCompleted(tc.name, args, tc.id);
            } else {
              // RA-008: a state-changing call may have changed the repo;
              // equivalent reads must be allowed to re-run afterwards.
              dedupGate.markStateChanged();
            }
          }

          toolFailureTracker = updateToolFailureTracker(toolFailureTracker, tc.name, ok);
          if (toolFailureTracker.consecutiveFailCount >= 2) {
            yield {
              type: "done",
              result: repeatedToolFailureResult(tc.name, toolResult, toolCallsMade),
            };
            return;
          }
          if (toolCallsMade.length >= toolBudget) {
            yield {
              type: "done",
              result: toolBudgetExhaustedResult(toolCallsMade, dedupGate.suppressedCalls),
            };
            return;
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
        if (activeReadOnlyGroupId) yield { type: "tool_group_end", groupId: activeReadOnlyGroupId };
        continue;
      }

      // ── Text response — try to parse final JSON ─────────────────────────────
      lastText = accumulated;
      messages.push({ role: "assistant", content: lastText });

      const control = parseControlResponse(lastText);
      const parsed = control.control;
      if (parsed) {
        const result = withGroundedToolEvidence(guardReviewOnlyFinalResult(
          plannerResultFromControl(parsed, {
            visibleText: control.visibleText,
            fallbackText: lastText,
            finalizationMode: control.mode,
            streamedResponse: emittedVisibleResponse || undefined,
            toolCallsMade,
            usedLlm: true,
          }),
          message,
        ), publicToolEvidence);
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
        content: `Call the ${CHAT_FINAL_TOOL_NAME} tool now with response, risk_level, actions_taken, suggestions, and any approval_proposal. If you are proposing a write action, approval_proposal is required. Only if tool calling is unavailable, use the compatibility fallback line starting with ${CHAT_CONTROL_JSON_MARKER}.`,
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
}

function hasUserFacingFinalResponse(control: Record<string, unknown>, visibleText: string): boolean {
  return typeof control["response"] === "string" && control["response"].trim().length > 0
    || visibleText.trim().length > 0;
}

/**
 * Keep the main agent's budget independent from the fast narrator. A first,
 * explicitly read-only evidence pass benefits from low reasoning; follow-up
 * decisions and any task that may change state retain the more deliberate
 * medium mode for tool selection and final evidence judgement.
 */
function plannerReasoningEffort(message: string, step: number): "low" | "medium" {
  return step === 0 && isExplicitReadOnlyRequest(message) ? "low" : "medium";
}

function withGroundedToolEvidence(
  result: ChatPlannerResult,
  evidence: PublicToolEvidence[],
): ChatPlannerResult {
  return {
    ...result,
    // MP-003: Final owns the conclusion; evidence is a structured reference
    // list keyed by call, never replayed text.
    response: groundFinalResponse(result.response, evidence),
    evidence: finalEvidenceReferences(evidence),
  };
}

function toolBudgetExhaustedResult(
  toolCallsMade: ChatPlannerResult["toolCallsMade"],
  suppressedCalls: number,
): ChatPlannerResult {
  return {
    response: `This turn reached its tool budget after ${toolCallsMade.length} tool calls${
      suppressedCalls > 0 ? ` (${suppressedCalls} repeated equivalent calls were suppressed)` : ""
    }. Summarize what was already gathered and propose the next step instead of running more commands.`,
    riskLevel: "low",
    actionsTaken: toolCallsMade.map((t) => t.name),
    suggestions: [],
    toolCallsMade,
    usedLlm: true,
  };
}

function actionNarrativeEvidence(messages: Array<{ role: string; content?: unknown }>): string | undefined {
  const recentToolResults = messages
    .filter((entry) => entry.role === "tool" && typeof entry.content === "string")
    .slice(-3)
    .map((entry) => String(entry.content).replace(/\s+/g, " ").slice(0, 800));
  return recentToolResults.length ? recentToolResults.join("\n") : undefined;
}

function publicPlannedAction(
  toolCalls: Array<{ name: string }>,
  capabilitiesByName: Map<string, { description: string }>,
): string {
  return toolCalls
    .map((toolCall) => publicToolActionLabel(capabilitiesByName.get(toolCall.name)?.description, toolCall.name))
    .join(", then ");
}

function publicToolActionLabel(description: string | undefined, toolName: string): string {
  // Tool registry descriptions are written for the model and frequently
  // include parameter/flag help. A transcript is a concise public action
  // note, so derive it from the actual tool identity instead of leaking that
  // documentation into the Working canvas.
  const labels: Record<string, string> = {
    git_status: "check the working-tree status",
    git_current_branch: "check the active branch",
    git_log: "inspect recent commits",
    git_diff: "inspect the current diff",
    git_branch_list: "list the available branches",
    git_remote: "inspect the configured remotes",
    git_show: "inspect the selected commit",
    git_merge_base: "compare the branch ancestry",
    git_checkpoint: "create a safety checkpoint",
    git_checkpoint_show: "inspect the safety checkpoint",
    repo_refresh_index: "refresh the repository index",
  };
  if (labels[toolName]) return labels[toolName]!;
  if (toolName.startsWith("mcp_")) return `query ${toolName.slice(4).replace(/_/g, " ")}`;
  if (/test|lint|typecheck/i.test(toolName)) return "run the requested verification";
  if (/build/i.test(toolName)) return "run the requested build";
  // For a custom tool, use its first sentence only when it is short enough
  // to remain an action note; otherwise retain a neutral, truthful label.
  const sentence = description?.split(/[.!?]/, 1)[0]?.replace(/\s+/g, " ").trim();
  return sentence && sentence.length <= 72 ? lowercaseFirst(sentence) : `run ${toolName.replace(/_/g, " ")}`;
}

function lowercaseFirst(value: string): string {
  return value ? `${value.slice(0, 1).toLocaleLowerCase()}${value.slice(1)}` : value;
}
