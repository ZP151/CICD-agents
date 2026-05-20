import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { bundleToPrompt, type ContextBundle } from "./contextBuilder.js";
import { LLMUnavailableError, type LLMClient } from "./llm.js";
import { logger } from "./logger.js";
import { getSettings } from "./settings.js";
import type { ToolExecutor } from "./tools/executor.js";

export const SYSTEM_PROMPT = `You are the Pipeline Agent for an internal CI/CD assistant.
You work on a local code index of a developer's repository and have access to
tools for inspecting code, running tests/builds, and interacting with Azure
DevOps. Decide which tools to call and stop as soon as you have enough
information to produce a final answer.

Always return your final answer as a JSON object with these fields:
  title            : short pull request title (<=80 chars)
  summary          : markdown PR description, with sections "What" and "Why"
                     and a short "Risks" bullet list
  risk_level       : one of "low", "medium", "high"
  reasoning        : 2-4 sentence justification of risk_level
  next_actions     : optional list of strings for follow-up

Do not invent file paths or symbols that are not present in the context. If
the diff is empty, return a short summary that explains why.`;

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
            content: truncate(JSON.stringify(toolResult), 6000),
          });
          void ok;
        }
        continue;
      }

      lastText = resp.content ?? "";
      messages.push({ role: "assistant", content: lastText });

      const parsed = parseFinalJson(lastText);
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
      title: firstLine(lastText) || "Automated PR",
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
            content: truncate(JSON.stringify(toolResult), 6000),
          });
        }
        continue;
      }

      lastText = accumulated;
      messages.push({ role: "assistant", content: lastText });
      const parsed = parseFinalJson(lastText);
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
      title: firstLine(lastText) || "Automated PR",
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
    const first = bundle.changedFiles[0];
    if (!first) {
      return { title: "No changes", summary: "There are no file changes against the target branch." };
    }
    const added = bundle.changedFiles.filter((f) => f.status === "added").length;
    const modified = bundle.changedFiles.filter((f) => f.status === "modified").length;
    const deleted = bundle.changedFiles.filter((f) => f.status === "deleted").length;
    const additions = bundle.changedFiles.reduce((s, f) => s + f.additions, 0);
    const deletions = bundle.changedFiles.reduce((s, f) => s + f.deletions, 0);
    let title = `Update ${first.path}`;
    if (bundle.changedFiles.length > 1) {
      title = `Update ${bundle.changedFiles.length} files including ${first.path}`;
    }
    title = title.slice(0, 80);
    const lines = [
      "## What",
      `- ${bundle.changedFiles.length} file(s) changed (${added} added, ${modified} modified, ${deleted} deleted)`,
      `- +${additions} / -${deletions} lines`,
      "",
      "## Why",
      "_Automatically generated; LLM unavailable. Edit before merging._",
      "",
      "## Risks",
      "- Review the diff manually.",
    ];
    if (bundle.affectedSymbols.length > 0) {
      lines.push("", "## Affected symbols");
      for (const s of bundle.affectedSymbols.slice(0, 20)) lines.push(`- ${s}`);
    }
    return { title, summary: lines.join("\n") };
  }
}

function parseFinalJson(text: string): Record<string, unknown> | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("```")) {
    const end = trimmed.lastIndexOf("```");
    if (end > 3) {
      const inner = trimmed.slice(trimmed.indexOf("\n") + 1, end).trim();
      try {
        const obj = JSON.parse(inner);
        if (obj && typeof obj === "object" && !Array.isArray(obj)) {
          return obj as Record<string, unknown>;
        }
      } catch {
        // fall through
      }
    }
  }
  const open = trimmed.indexOf("{");
  const close = trimmed.lastIndexOf("}");
  if (open !== -1 && close !== -1 && close > open) {
    try {
      const obj = JSON.parse(trimmed.slice(open, close + 1));
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        return obj as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (s) return s.slice(0, 80);
  }
  return "";
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 20) + "...(truncated)...";
}
