import { describe, expect, it } from "vitest";
import { sourceReferenceTitle } from "./ReferenceParts.js";

describe("sourceReferenceTitle", () => {
  it("uses a clean title when a document source only has a ranged title", () => {
    expect(sourceReferenceTitle({
      type: "source_document",
      sourceId: "source-1",
      title: "ClaimController.cs:42-58",
    })).toBe("ClaimController.cs");
  });
});
