import { describe, it, expect, vi } from "vitest";
import { Session } from "../session.js";
import { Agent } from "../agent.js";

// Minimal mock agent that yields a simple completion
function createMockAgent(): Agent {
  const model = {
    specificationVersion: "v2",
    provider: "mock",
    modelId: "mock-model",
    doStream: vi.fn(),
    doGenerate: vi.fn(),
  };

  // Create Agent with a model that we'll bypass via mock
  return new Agent({
    name: "test",
    model: model as any,
    maxSteps: 1,
    instructions: false,
  });
}

describe("Session.toResponse", () => {
  it("returns a Response with correct SSE headers", () => {
    const agent = createMockAgent();
    const session = new Session({ agent });

    // Mock session.send to yield minimal events
    const originalSend = session.send.bind(session);
    session.send = async function* () {
      yield {
        type: "done" as const,
        result: "complete" as const,
        messages: [],
        totalUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      };
    };

    const response = session.toResponse("hello");

    expect(response).toBeInstanceOf(Response);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.body).toBeTruthy();

    // Restore
    session.send = originalSend;
  });

  it("passes custom headers through", () => {
    const agent = createMockAgent();
    const session = new Session({ agent });

    session.send = async function* () {
      yield {
        type: "done" as const,
        result: "complete" as const,
        messages: [],
        totalUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        },
      };
    };

    const response = session.toResponse("hello", {
      headers: { "X-Custom": "test" },
    });

    expect(response.headers.get("x-custom")).toBe("test");
  });
});
