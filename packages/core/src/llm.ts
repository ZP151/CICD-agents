import { AzureOpenAI } from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getSettings, type Settings } from "./settings.js";
import { logger } from "./logger.js";

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
  type: "delta" | "tool_call" | "done";
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

  get size(): number {
    return this.accum.size;
  }
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
  embedTokens: number;
}

export class LLMClient {
  private client: AzureOpenAI | null = null;
  public readonly usage: UsageTotals = {
    promptTokens: 0,
    completionTokens: 0,
    embedTokens: 0,
  };

  constructor(private readonly settings: Settings = getSettings()) {}

  get configured(): boolean {
    return this.settings.llmConfigured;
  }

  private get(): AzureOpenAI {
    if (this.client) return this.client;
    if (!this.configured) {
      throw new LLMUnavailableError(
        "Azure OpenAI is not configured (AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY required).",
      );
    }
    this.client = new AzureOpenAI({
      endpoint: this.settings.azureOpenAiEndpoint,
      apiKey: this.settings.azureOpenAiApiKey,
      apiVersion: this.settings.azureOpenAiApiVersion,
      deployment: this.settings.azureOpenAiChatDeployment,
    });
    return this.client;
  }

  async chat(opts: {
    messages: ChatCompletionMessageParam[];
    tools?: ChatCompletionTool[];
    temperature?: number;
    maxTokens?: number;
    retries?: number;
  }): Promise<ChatResult> {
    const retries = opts.retries ?? 3;
    const params: ChatCompletionCreateParamsNonStreaming = {
      model: this.settings.azureOpenAiChatDeployment,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
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
  }): AsyncGenerator<ChatStreamEvent, void, unknown> {
    const stream = await this.get().chat.completions.create({
      model: this.settings.azureOpenAiChatDeployment,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
      tools: opts.tools && opts.tools.length > 0 ? opts.tools : undefined,
      tool_choice: opts.tools && opts.tools.length > 0 ? "auto" : undefined,
      stream: true,
      stream_options: { include_usage: true },
    });

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
      }
      if (choice.finish_reason) {
        finishReason = choice.finish_reason;
      }
    }

    if (assembler.size > 0) {
      yield { type: "tool_call", toolCalls: assembler.finalize() };
    }

    yield { type: "done", finishReason };
  }

  async embed(inputs: string[], retries = 3): Promise<number[][]> {
    if (inputs.length === 0) return [];
    let lastErr: unknown;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const resp = await this.get().embeddings.create({
          model: this.settings.azureOpenAiEmbeddingDeployment,
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
