import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { bundleToPrompt, type ContextBundle } from "./contextBuilder.js";
import { LLMUnavailableError, type LLMClient } from "./llm.js";
import { logger } from "./logger.js";
import {
  buildPlannerOfflineSummary,
  firstPlannerLine,
  parsePlannerFinalJson,
  PIPELINE_SYSTEM_PROMPT,
  truncatePlannerText,
} from "./plannerSupport.js";
import { getSettings } from "./settings.js";
import type { ToolExecutor } from "./tools/executor.js";

export const SYSTEM_PROMPT = PIPELINE_SYSTEM_PROMPT;

export interface PlannerResult {
  title: string;
  summary: string;
  riskLevel: string;
  reasoning: string;
  nextActions: string[];
  toolCallsMade: Array<{ name: string; args: Record<string, unknown>; result: unknown }>;
  usedLlm: boolean;
}

export type StreamEvent =
  | { type: "step"; name: string; status: "info" | "ok" | "warn" | "error"; detail?: string }
  | { type: "delta"; delta: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_end"; name: string; result: unknown; ok: boolean }
  | { type: "final"; result: PlannerResult };

export class Planner {
  private readonly maxSteps: number;
  private readonly tokenBudget: number;

  constructor(
    private readonly llm: LLMClient,
    private readonly executor: ToolExecutor,
    opts: { maxSteps?: number; tokenBudget?: number } = {},
  ) {
    const settings = getSettings();
    this.maxSteps = opts.maxSteps ?? settings.plannerMaxSteps;
    this.tokenBudget = opts.tokenBudget ?? settings.plannerTokenBudget;
  }

  async run(bundle: ContextBundle): Promise<PlannerResult> {
    if (!this.llm.configured) return this.offlineResult(bundle);
    const prompt = bundleToPrompt(bundle, this.tokenBudget);
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "Below is the repository context. Plan your next moves, call tools as needed, and finish with a JSON answer.\n\n" +
          prompt,
      },
    ];
    const tools = this.executor.schemas();
    const toolCalls: PlannerResult["toolCallsMade"] = [];
    let lastText = "";

    for (let step = 0; step < this.maxSteps; step++) {
      let resp;
      try {
        resp = await this.llm.chat({ messages, tools, maxTokens: 1200 });
      } catch (err) {
        if (err instanceof LLMUnavailableError) return this.offlineResult(bundle);
        throw err;
      }

      if (resp.toolCalls.length > 0) {
        messages.push({
          role: "assistant",
          content: resp.content || null,
          tool_calls: resp.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          })),
        });
        for (const tc of resp.toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.arguments || "{}");
          } catch {
            args = {};
          }
          let toolResult: unknown;
          let ok = true;
          try {
            toolResult = { ok: true, result: await this.executor.call(tc.name, args) };
          } catch (err) {
            ok = false;
            const msg = err instanceof Error ? err.message : String(err);
            toolResult = { ok: false, error: msg };
            logger().warn({ tool: tc.name, err: msg }, "tool failed");
          }
          toolCalls.push({ name: tc.name, args, result: toolResult });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: truncatePlannerText(JSON.stringify(toolResult), 6000),
          });
          void ok;
        }
        continue;
      }

      lastText = resp.content ?? "";
      messages.push({ role: "assistant", content: lastText });

      const parsed = parsePlannerFinalJson(lastText);
      if (parsed) {
        return {
          title: String(parsed.title ?? "").slice(0, 160),
          summary: String(parsed.summary ?? ""),
          riskLevel: String(parsed.risk_level ?? "low"),
          reasoning: String(parsed.reasoning ?? ""),
          nextActions: ((parsed.next_actions as unknown[]) ?? []).map((x) => String(x)),
          toolCallsMade: toolCalls,
          usedLlm: true,
        };
      }
      messages.push({
        role: "user",
        content:
          "Please emit your final answer now as a JSON object with keys: title, summary, risk_level, reasoning, next_actions.",
      });
    }

    return {
      title: firstPlannerLine(lastText) || "Automated PR",
      summary: lastText || "(no model output)",
      riskLevel: "medium",
      reasoning: "Planner reached the step ceiling without a structured answer.",
      nextActions: [],
      toolCallsMade: toolCalls,
      usedLlm: true,
    };
  }

  async runStreaming(
    bundle: ContextBundle,
    onEvent: (e: StreamEvent) => void,
  ): Promise<PlannerResult> {
    if (!this.llm.configured) {
      const offline = this.offlineResult(bundle);
      onEvent({ type: "final", result: offline });
      return offline;
    }
    const prompt = bundleToPrompt(bundle, this.tokenBudget);
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content:
          "Below is the repository context. Plan your next moves, call tools as needed, and finish with a JSON answer.\n\n" +
          prompt,
      },
    ];
    const tools = this.executor.schemas();
    const toolCalls: PlannerResult["toolCallsMade"] = [];
    let lastText = "";

    for (let step = 0; step < this.maxSteps; step++) {
      let accumulated = "";
      let toolFromStream: import("./llm.js").ChatToolCall[] = [];
      try {
        for await (const ev of this.llm.chatStream({ messages, tools, maxTokens: 1200 })) {
          if (ev.type === "delta" && ev.delta) {
            accumulated += ev.delta;
            onEvent({ type: "delta", delta: ev.delta });
          } else if (ev.type === "tool_call" && ev.toolCalls) {
            toolFromStream = ev.toolCalls;
          }
        }
      } catch (err) {
        if (err instanceof LLMUnavailableError) {
          const offline = this.offlineResult(bundle);
          onEvent({ type: "final", result: offline });
          return offline;
        }
        throw err;
      }

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
            args = JSON.parse(tc.arguments || "{}");
          } catch {
            args = {};
          }
          onEvent({ type: "tool_start", name: tc.name, args });
          let toolResult: unknown;
          let ok = true;
          try {
            toolResult = { ok: true, result: await this.executor.call(tc.name, args) };
          } catch (err) {
            ok = false;
            toolResult = { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
          onEvent({ type: "tool_end", name: tc.name, result: toolResult, ok });
          toolCalls.push({ name: tc.name, args, result: toolResult });
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: truncatePlannerText(JSON.stringify(toolResult), 6000),
          });
        }
        continue;
      }

      lastText = accumulated;
      messages.push({ role: "assistant", content: lastText });
      const parsed = parsePlannerFinalJson(lastText);
      if (parsed) {
        const result: PlannerResult = {
          title: String(parsed.title ?? "").slice(0, 160),
          summary: String(parsed.summary ?? ""),
          riskLevel: String(parsed.risk_level ?? "low"),
          reasoning: String(parsed.reasoning ?? ""),
          nextActions: ((parsed.next_actions as unknown[]) ?? []).map((x) => String(x)),
          toolCallsMade: toolCalls,
          usedLlm: true,
        };
        onEvent({ type: "final", result });
        return result;
      }
      messages.push({
        role: "user",
        content:
          "Please emit your final answer now as a JSON object with keys: title, summary, risk_level, reasoning, next_actions.",
      });
    }
    const fallback: PlannerResult = {
      title: firstPlannerLine(lastText) || "Automated PR",
      summary: lastText || "(no model output)",
      riskLevel: "medium",
      reasoning: "Planner reached the step ceiling without a structured answer.",
      nextActions: [],
      toolCallsMade: toolCalls,
      usedLlm: true,
    };
    onEvent({ type: "final", result: fallback });
    return fallback;
  }

  private offlineResult(bundle: ContextBundle): PlannerResult {
    const { title, summary } = Planner.buildOfflineSummary(bundle);
    let risk = "low";
    if (
      bundle.changedFiles.length > 10 ||
      bundle.changedFiles.some((cf) => cf.deletions > 100)
    ) {
      risk = "medium";
    }
    return {
      title,
      summary,
      riskLevel: risk,
      reasoning: "LLM unavailable; produced a deterministic summary from the diff.",
      nextActions: [],
      toolCallsMade: [],
      usedLlm: false,
    };
  }

  static buildOfflineSummary(bundle: ContextBundle): { title: string; summary: string } {
    return buildPlannerOfflineSummary(bundle);
  }
}
