import { describe, expect, it } from "vitest";
import { streamActionNarrative } from "../src/chatPublicOpening.js";
import type { LLMClient } from "../src/llm.js";

describe("streamActionNarrative", () => {
  it("streams only the model-authored public opening and never a canned fallback", async () => {
    const llm = {
      configured: true,
      actionNarrativeModel: () => "fast-narrative-model",
    async *chatStream(options: { messages: Array<{ role: string; content: unknown }>; tools?: unknown; maxTokens?: number }) {
      expect(options.tools).toBeUndefined();
      expect(options.maxTokens).toBeLessThanOrEqual(96);
      expect((options as { model?: string }).model).toBe("fast-narrative-model");
      expect(JSON.stringify(options.messages)).toContain("Review the current project changes");
      expect(JSON.stringify(options.messages)).toContain("Always respond in English; this product has one English conversation path");
      expect(JSON.stringify(options.messages)).toContain("Do not repeat the user's request verbatim or use labels such as Goal");
      expect(JSON.stringify(options.messages)).toContain("never use generic framing such as 'Based on the request'");
      expect(JSON.stringify(options.messages)).toContain("No repository evidence is available yet");
      expect(JSON.stringify(options.messages)).toContain("Do not reveal private reasoning");
      expect(JSON.stringify(options.messages)).toContain("ask permission for a clearly read-only action");
      expect(JSON.stringify(options.messages)).toContain("do not propose cloning, fetching, remote metadata, setup, or a repository-existence check");
      expect(JSON.stringify(options.messages)).not.toContain("Working directory");
        yield { type: "delta" as const, delta: "I will first establish the change scope" };
        yield { type: "delta" as const, delta: " and then run the smallest read-only check." };
        yield { type: "done" as const };
      },
    } as Pick<LLMClient, "configured" | "chatStream">;

    const events = [];
    for await (const event of streamActionNarrative(llm, { request: "Review the current project changes" })) events.push(event);

    expect(events).toEqual([
      { type: "work_statement", blockId: "opening", text: "I will first establish the change scope and then run the smallest read-only check.", replace: true },
    ]);
    expect(JSON.stringify(events)).not.toContain("Establish the relevant evidence first");
  });

  it("does not fabricate an opening when the model is unavailable", async () => {
    const llm = { configured: false } as Pick<LLMClient, "configured" | "chatStream">;
    const events = [];
    for await (const event of streamActionNarrative(llm, { request: "inspect the branch" })) events.push(event);
    expect(events).toEqual([]);
  });

  it("hands off after the first complete action sentence instead of waiting for a verbose continuation", async () => {
    const llm = {
      configured: true,
      async *chatStream() {
        yield { type: "delta" as const, delta: "I will verify the changed files first. " };
        yield { type: "delta" as const, delta: "Then I will run the smallest read-only check. " };
        yield { type: "delta" as const, delta: "This third sentence must not delay the action group." };
      },
    } as Pick<LLMClient, "configured" | "chatStream">;

    const events = [];
    for await (const event of streamActionNarrative(llm, { request: "Review the change" })) events.push(event);

    expect(events.at(-1)).toMatchObject({ text: "I will verify the changed files first." });
    expect(JSON.stringify(events)).not.toContain("Then I will run");
    expect(JSON.stringify(events)).not.toContain("third sentence");
  });

  it("preserves normal word boundaries from token-sized streamed deltas", async () => {
    const llm = {
      configured: true,
      async *chatStream() {
        yield { type: "delta" as const, delta: "I'll" };
        yield { type: "delta" as const, delta: " inspect" };
        yield { type: "delta" as const, delta: " the current branch." };
      },
    } as Pick<LLMClient, "configured" | "chatStream">;

    const events = [];
    for await (const event of streamActionNarrative(llm, { request: "Inspect the branch" })) events.push(event);

    expect(events.at(-1)).toMatchObject({ text: "I'll inspect the current branch." });
  });

  it("does not insert spaces inside a word split into subword deltas", async () => {
    const llm = {
      configured: true,
      async *chatStream() {
        yield { type: "delta" as const, delta: "I will inspect un" };
        yield { type: "delta" as const, delta: "committed" };
        yield { type: "delta" as const, delta: " changes." };
      },
    } as Pick<LLMClient, "configured" | "chatStream">;

    const events = [];
    for await (const event of streamActionNarrative(llm, { request: "Inspect the working tree" })) events.push(event);

    expect(events.at(-1)).toMatchObject({ text: "I will inspect uncommitted changes." });
  });

  it("waits for a useful initial phrase instead of rendering an isolated model token", async () => {
    const llm = {
      configured: true,
      async *chatStream() {
        yield { type: "delta" as const, delta: "I" };
        yield { type: "delta" as const, delta: " will inspect " };
        yield { type: "delta" as const, delta: "the branch." };
      },
    } as Pick<LLMClient, "configured" | "chatStream">;

    const events = [];
    for await (const event of streamActionNarrative(llm, { request: "Inspect the branch" })) events.push(event);

    expect(events).toEqual([
      expect.objectContaining({ text: "I will inspect" }),
      expect.objectContaining({ text: "I will inspect the branch." }),
    ]);
    expect(JSON.stringify(events)).not.toContain('"text":"I"');
  });
});
