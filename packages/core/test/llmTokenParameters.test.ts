import { describe, expect, it } from "vitest";
import { completionTokenLimit } from "../src/llm.js";

describe("completionTokenLimit", () => {
  it("uses the GPT-5 Chat Completions parameter for the packaged gpt-5-mini deployment", () => {
    expect(completionTokenLimit("gpt-5-mini", 1024)).toEqual({
      max_completion_tokens: 1024,
    });
  });

  it("recognizes the GPT-5 deployment aliases used by Azure", () => {
    expect(completionTokenLimit("gpt5mini", 48)).toEqual({
      max_completion_tokens: 48,
    });
    expect(completionTokenLimit("gpt-5-pro", 48)).toEqual({
      max_completion_tokens: 48,
    });
  });

  it("keeps the legacy parameter for non-reasoning deployments", () => {
    expect(completionTokenLimit("gpt-4o", 1024)).toEqual({ max_tokens: 1024 });
  });
});
