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
  outOfScopeWriteMessage,
  requiredChangeInspectionGuidance,
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
import type {
  ChatEvent,
  ChatImageAttachment,
  ChatMessage,
  ChatPlannerResult,
} from "./chatPlannerTypes.js";

export type {
  ChatApprovalRequest,
  ChatEvent,
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
  ): AsyncGenerator<ChatEvent> {
    if (!this.llm.configured) {
      yield* offlineFallbackEvents(message);
      return;
    }

    const registeredTools = this.executor.list();
    const messages = buildPlannerMessages({
      message,
      history,
      repoPath,
      contextPrompt,
      tools: registeredTools,
      imageAttachments,
    });
    const tools = buildPlannerToolSchemas(registeredTools);
    const capabilitiesByName = buildToolCapabilitiesByName(registeredTools);
    const toolCallsMade: ChatPlannerResult["toolCallsMade"] = [];
    let lastText = "";
    let streamedVisibleResponse = "";
    let confirmedOnce = false;
    // Track consecutive failures of the same tool to prevent infinite retry loops.
    let toolFailureTracker = { lastFailedTool: "", consecutiveFailCount: 0 };

    for (let step = 0; step < this.maxSteps; step++) {
      let streamResult;
      try {
        streamResult = yield* collectPlannerStepStream(
          this.llm,
          messages,
          tools,
          streamedVisibleResponse,
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
          const result = guardReviewOnlyFinalResult(
            plannerResultFromControl(args, {
              visibleText: accumulated,
              fallbackText: accumulated,
              finalizationMode: "agent_final",
              streamedResponse: emittedVisibleResponse || undefined,
              toolCallsMade,
              usedLlm: true,
            }),
            message,
          );
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

        for (const [toolCallIndex, tc] of executableToolCalls.entries()) {
          if (toolCallIndex > 0) {
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({
                ok: false,
                deferred: true,
                guidance:
                  "This command was intentionally deferred. Re-evaluate after the preceding tool result and call at most one next executable tool.",
              }),
            });
            continue;
          }
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

          const { ok, toolResult } = yield* executePlannerToolCall(this.executor, tc, args);
          toolCallsMade.push({ name: tc.name, args, ok });

          toolFailureTracker = updateToolFailureTracker(toolFailureTracker, tc.name, ok);
          if (toolFailureTracker.consecutiveFailCount >= 2) {
            yield {
              type: "done",
              result: repeatedToolFailureResult(tc.name, toolResult, toolCallsMade),
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
        continue;
      }

      // ── Text response — try to parse final JSON ─────────────────────────────
      lastText = accumulated;
      messages.push({ role: "assistant", content: lastText });

      const control = parseControlResponse(lastText);
      const parsed = control.control;
      if (parsed) {
        const result = guardReviewOnlyFinalResult(
          plannerResultFromControl(parsed, {
            visibleText: control.visibleText,
            fallbackText: lastText,
            finalizationMode: control.mode,
            streamedResponse: emittedVisibleResponse || undefined,
            toolCallsMade,
            usedLlm: true,
          }),
          message,
        );
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
