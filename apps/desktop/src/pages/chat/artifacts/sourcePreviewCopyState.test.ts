import { describe, expect, it } from "vitest";
import {
  sourcePreviewCopyLabel,
  type SourcePreviewCopyState,
} from "./sourcePreviewCopyState.js";

describe("sourcePreviewCopyLabel", () => {
  it("uses compact idle labels", () => {
    expect(sourcePreviewCopyLabel("path", null)).toBe("Path");
    expect(sourcePreviewCopyLabel("content", null)).toBe("Copy");
  });

  it("shows copied only for the matching action", () => {
    const state: SourcePreviewCopyState = { kind: "path", status: "copied" };

    expect(sourcePreviewCopyLabel("path", state)).toBe("Copied");
    expect(sourcePreviewCopyLabel("content", state)).toBe("Copy");
  });

  it("shows failed only for the matching action", () => {
    const state: SourcePreviewCopyState = { kind: "content", status: "failed" };

    expect(sourcePreviewCopyLabel("path", state)).toBe("Path");
    expect(sourcePreviewCopyLabel("content", state)).toBe("Failed");
  });
});
