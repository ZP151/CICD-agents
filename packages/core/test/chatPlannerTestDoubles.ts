import { ChatPlanner } from "../src/chatPlanner.js";
import type { ChatStreamEvent, LLMClient } from "../src/llm.js";
import { ToolExecutor, type Tool } from "../src/tools/executor.js";

export function fakeLlm(json: string): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      yield { type: "delta", delta: json };
      yield { type: "done", finishReason: "stop" };
    },
  } as unknown as LLMClient;
}

export function fakeChunkedLlm(chunks: string[]): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      for (const chunk of chunks) yield { type: "delta", delta: chunk };
      yield { type: "done", finishReason: "stop" };
    },
  } as unknown as LLMClient;
}

export function fakeToolCallLlm(name: string, args: Record<string, unknown>): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      yield {
        type: "tool_call",
        toolCalls: [{ id: "call_1", name, arguments: JSON.stringify(args) }],
      };
      yield { type: "done", finishReason: "tool_calls" };
    },
  } as unknown as LLMClient;
}

export function fakeStreamingToolCallLlm(name: string, argumentChunks: string[]): LLMClient {
  return {
    configured: true,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      let accumulated = "";
      for (const chunk of argumentChunks) {
        accumulated += chunk;
        yield {
          type: "tool_call_delta",
          toolCalls: [{ id: "call_1", name, arguments: accumulated }],
        };
      }
      yield {
        type: "tool_call",
        toolCalls: [{ id: "call_1", name, arguments: accumulated }],
      };
      yield { type: "done", finishReason: "tool_calls" };
    },
  } as unknown as LLMClient;
}

export function fakeSequenceLlm(
  sequences: ChatStreamEvent[][],
  calls?: Array<{ messages?: unknown[] }>,
): LLMClient {
  let index = 0;
  return {
    configured: true,
    async *chatStream(opts: { messages?: unknown[] }): AsyncGenerator<ChatStreamEvent> {
      calls?.push({ messages: opts.messages });
      const events = sequences[index++] ?? [];
      for (const event of events) yield event;
    },
  } as unknown as LLMClient;
}

export function unavailableLlm(): LLMClient {
  return {
    configured: false,
    async *chatStream(): AsyncGenerator<ChatStreamEvent> {
      throw new Error("chatStream should not be called when unconfigured");
    },
  } as unknown as LLMClient;
}

export function createToolExecutor(): ToolExecutor {
  return new ToolExecutor({ repoPath: ".", env: {}, timeoutSec: 1, extra: {} });
}

export async function runPlanner(json: string) {
  const planner = new ChatPlanner(fakeLlm(json), createToolExecutor(), { maxSteps: 1 });
  const events = [];
  for await (const event of planner.run("continue", [], ".", async () => true)) {
    events.push(event);
  }
  const done = events.find((event) => event.type === "done");
  if (!done || done.type !== "done") throw new Error("missing done event");
  return done.result;
}

export async function runPlannerWithToolCall(
  tool: Tool,
  args: Record<string, unknown>,
  message = "run tool",
) {
  let called = false;
  const executor = createToolExecutor();
  executor.register({
    ...tool,
    handler: async (ctx, payload) => {
      called = true;
      return tool.handler(ctx, payload);
    },
  });
  const planner = new ChatPlanner(fakeToolCallLlm(tool.name, args), executor, { maxSteps: 1 });
  const events = [];
  for await (const event of planner.run(message, [], ".", async () => true)) {
    events.push(event);
  }
  const done = events.find((event) => event.type === "done");
  if (!done || done.type !== "done") throw new Error("missing done event");
  return { called, result: done.result, events };
}
