import { describe, expect, it } from "vitest";
import { sourcePreviewSnippetFallbackNotice } from "./sourcePreviewLoadState.js";

describe("source preview load state", () => {
  it("includes the full-file load failure reason when showing an attached snippet", () => {
    expect(sourcePreviewSnippetFallbackNotice({
      message: "File is too large to preview.",
    })).toBe("Showing attached snippet because the full file could not be loaded: File is too large to preview.");
  });

  it("keeps a concise fallback notice when no reason is available", () => {
    expect(sourcePreviewSnippetFallbackNotice({})).toBe(
      "Showing attached snippet because the full file could not be loaded.",
    );
  });
});
