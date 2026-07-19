import { describe, expect, it } from "vitest";
import {
  referenceChipClass,
  sourceReferenceTitle,
} from "./ReferenceParts.js";

describe("sourceReferenceTitle", () => {
  it("uses a clean title when a document source only has a ranged title", () => {
    expect(sourceReferenceTitle({
      type: "source_document",
      sourceId: "source-1",
      title: "ClaimController.cs:42-58",
    })).toBe("ClaimController.cs");
  });
});

describe("referenceChipClass", () => {
  it("keeps inline source chips bounded by the transcript column", () => {
    const className = referenceChipClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("max-w-[min(13rem,100%)]");
    expect(className).not.toContain("max-w-[13rem]");
  });
});
