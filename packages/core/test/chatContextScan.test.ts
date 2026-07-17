import { describe, expect, it } from "vitest";
import { summarizeRepo } from "../src/chatContextScan.js";

describe("chatContextScan", () => {
  it("uses readable file-type fallback wording when no file extensions are available", () => {
    const summary = summarizeRepo([], 0, 0);

    expect(summary).toContain("file types: not available");
    expect(summary).not.toContain("unknown");
  });
});
