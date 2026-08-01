import OpenAI, { AzureOpenAI } from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getSettings, type Settings } from "./settings.js";
import { logger } from "./logger.js";

// A streaming Turn cannot leave its Working canvas open indefinitely when a
// provider accepts a connection but never emits its first chunk. The desktop
// shows a truthful waiting diagnostic after five seconds; this bounded request
// turns a persistent transport failure into the canonical failed Turn.
const STREAM_REQUEST_TIMEOUT_MS = 15_000;

export class LLMUnavailableError extends Error {}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatResult {
  content: string;
  toolCalls: ChatToolCall[];
  finishReason: string;
}

export interface ChatStreamEvent {
  type: "delta" | "tool_call_delta" | "tool_call" | "done";
  delta?: string;
  toolCalls?: ChatToolCall[];
  finishReason?: string;
}

interface StreamingToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

// Exported for tests. OpenAI emits tool_calls in fragmented deltas: the id
// arrives once, the function name arrives once, and the arguments arrive in
// several chunks. We index by `index` to assemble them back into whole calls.
export class ToolCallAssembler {
  private readonly accum = new Map<
    number,
    { id: string; name: string; argsChunks: string[] }
  >();

  ingest(deltas: StreamingToolCallDelta[]): void {
    for (const tc of deltas) {
      const idx = tc.index;
      let entry = this.accum.get(idx);
      if (!entry) {
        entry = {
          id: tc.id ?? "",
          name: tc.function?.name ?? "",
          argsChunks: [],
        };
        this.accum.set(idx, entry);
      }
      if (tc.id && !entry.id) entry.id = tc.id;
      if (tc.function?.name) entry.name = tc.function.name;
      if (tc.function?.arguments) entry.argsChunks.push(tc.function.arguments);
    }
  }

  finalize(): ChatToolCall[] {
    return [...this.accum.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, v]) => ({
        id: v.id,
        name: v.name,
        arguments: v.argsChunks.join(""),
      }));
  }

  snapshot(): ChatToolCall[] {
    return this.finalize();
  }

  get size(): number {
    return this.accum.size;
  }
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  embedTokens: number;
}

type CompletionTokenLimit =
  | { max_tokens: number; max_completion_tokens?: never }
  | { max_completion_tokens: number; max_tokens?: never };

type CompletionTemperature =
  | { temperature: number }
  | { temperature?: never };

/**
 * Azure deployments are passed through the Chat Completions `model` field.
 * Keep all known reasoning-series compatibility decisions together so a
 * GPT-5 mini deployment cannot receive one legacy parameter from the normal
 * path and another from the streaming/health paths.
 */
export function isReasoningDeployment(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return /^(?:gpt-?5(?:$|[-_.]|mini|nano|pro)|o[134](?:$|[-_.]))/.test(normalized);
}

/**
 * Azure/OpenAI identifies an Azure deployment in `model`. GPT-5 reasoning
 * deployments reject the legacy `max_tokens` field, so the parameter must be
 * selected from the resolved deployment/model for both regular and streaming
 * Chat Completions calls.
 */
export function completionTokenLimit(model: string, maxTokens: number): CompletionTokenLimit {
  return isReasoningDeployment(model)
    ? { max_completion_tokens: maxTokens }
    : { max_tokens: maxTokens };
}

/** Reasoning deployments reject the legacy sampling controls, including temperature. */
export function completionTemperature(model: string, temperature: number): CompletionTemperature {
  return isReasoningDeployment(model) ? {} : { temperature };
}

export class LLMClient {
  private client: AzureOpenAI | OpenAI | null = null;
  public readonly usage: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    embedTokens: 0,
  };

  constructor(private readonly settings: Settings = getSettings()) {}

  get configured(): boolean {
    return this.settings.llmConfigured;
  }

  private get(): AzureOpenAI | OpenAI {
    if (this.client) return this.client;
    if (!this.configured) {
      throw new LLMUnavailableError(
        "The selected model provider is not reachable.",
      );
    }
    this.client = this.settings.llmProvider === "openai"
      ? new OpenAI({ apiKey: this.settings.openAiApiKey })
      : new AzureOpenAI({
          endpoint: this.settings.azureOpenAiEndpoint,
          apiKey: this.settings.azureOpenAiApiKey,
          apiVersion: this.settings.azureOpenAiApiVersion,
        });
    return this.client;
  }

  private chatModel(): string {
    return this.settings.llmProvider === "openai"
      ? this.settings.openAiModel
      : this.settings.azureOpenAiChatDeployment;
  }

  /**
   * Public action narration is latency-sensitive but must remain genuine
   * model output. A separately deployed low-latency model can be selected
   * without changing the main planner's tool and approval behaviour.
   */
  actionNarrativeModel(): string {
    if (this.settings.llmProvider === "openai") {
      return this.settings.openAiNarrativeModel || this.settings.openAiModel;
    }
    return this.settings.azureOpenAiNarrativeDeployment || this.settings.azureOpenAiChatDeployment;
  }

  private embeddingModel(): string {
    return this.settings.llmProvider === "openai"
      ? this.settings.openAiEmbeddingModel
      : this.settings.azureOpenAiEmbeddingDeployment;
  }

  async chat(opts: {
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    temperature?: number;
    maxTokens?: number;
    retries?: number;
  }): Promise<ChatResult> {
    const retries = opts.retries ?? 3;
    const model = this.chatModel();
    const params: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: opts.messages,
      ...completionTemperature(model, opts.temperature ?? 0.2),
      ...completionTokenLimit(model, opts.maxTokens ?? 1024),
    };
    if (opts.tools && opts.tools.length > 0) {
      params.tools = opts.tools;
      params.tool_choice = "auto";
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await this.get().chat.completions.create(params);
        const choice = resp.choices[0]!;
        const msg = choice.message;
        const toolCalls: ChatToolCall[] = (msg.tool_calls ?? []).map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments ?? "{}",
        }));
        if (resp.usage) {
          this.usage.promptTokens += resp.usage.prompt_tokens;
          this.usage.completionTokens += resp.usage.completion_tokens;
        }
        return {
          content: msg.content ?? "",
          toolCalls,
          finishReason: String(choice.finish_reason ?? ""),
        };
      } catch (err) {
        if (err instanceof LLMUnavailableError) throw err;
        lastErr = err;
        const backoff = 2 ** attempt * 1000 + Math.random() * 500;
        logger().warn(
          { attempt: attempt + 1, retries, backoff },
          "chat call failed; retrying",
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr ?? new Error("chat failed");
  }

  async *chatStream(opts: {
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    temperature?: number;
    maxTokens?: number;
    model?: string;
    /** Use a bounded reasoning mode only where the caller explicitly opts in. */
    reasoningEffort?: "low" | "medium" | "high";
  }): AsyncGenerator<ChatStreamEvent, void, unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STREAM_REQUEST_TIMEOUT_MS);
    try {
      const model = opts.model || this.chatModel();
      const stream = await this.get().chat.completions.create(
        {
          model,
          messages: opts.messages,
          ...completionTemperature(model, opts.temperature ?? 0.2),
          ...completionTokenLimit(model, opts.maxTokens ?? 1024),
          ...(opts.reasoningEffort && isReasoningDeployment(model)
            ? { reasoning_effort: opts.reasoningEffort }
            : {}),
          tools: opts.tools && opts.tools.length > 0 ? opts.tools : undefined,
          tool_choice: opts.tools && opts.tools.length > 0 ? "auto" : undefined,
          stream: true,
          stream_options: { include_usage: true },
        },
        { timeout: STREAM_REQUEST_TIMEOUT_MS, signal: controller.signal, maxRetries: 0 },
      );

      const assembler = new ToolCallAssembler();
      let finishReason = "";

      for await (const chunk of stream) {
        const choice = chunk.choices[0];
        if (!choice) {
          if (chunk.usage) {
            this.usage.promptTokens += chunk.usage.prompt_tokens;
            this.usage.completionTokens += chunk.usage.completion_tokens;
          }
          continue;
        }
        const delta = choice.delta;
        if (delta.content) {
          yield { type: "delta", delta: delta.content };
        }
        if (delta.tool_calls) {
          assembler.ingest(delta.tool_calls as unknown as StreamingToolCallDelta[]);
          yield { type: "tool_call_delta", toolCalls: assembler.snapshot() };
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }

      if (assembler.size > 0) {
        yield { type: "tool_call", toolCalls: assembler.finalize() };
      }
      yield { type: "done", finishReason };
    } finally {
      clearTimeout(timeout);
    }
  }

  async embed(inputs: string[], retries = 3): Promise<number[][]> {
    if (inputs.length === 0) return [];
    let lastErr: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await this.get().embeddings.create({
          model: this.embeddingModel(),
          input: inputs,
        });
        if (resp.usage) {
          this.usage.embedTokens += resp.usage.prompt_tokens;
        }
        return resp.data.map((d) => d.embedding);
      } catch (err) {
        if (err instanceof LLMUnavailableError) throw err;
        lastErr = err;
        const backoff = 2 ** attempt * 1000 + Math.random() * 500;
        logger().warn(
          { attempt: attempt + 1, retries, backoff },
          "embed call failed; retrying",
        );
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr ?? new Error("embed failed");
  }
}
