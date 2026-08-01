import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSATION_MODEL_LABEL } from "./chatModelSelection.js";

describe("built-in conversation model", () => {
  it("labels the bundled GPT-5 mini deployment instead of the retired GPT-4o fallback", () => {
    expect(DEFAULT_CONVERSATION_MODEL_LABEL).toBe("GPT-5 mini");
  });
});
