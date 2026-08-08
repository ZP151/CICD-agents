import { describe, expect, it } from "vitest";
import {
  hasComposerImageAttachmentSlot,
  MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES,
  selectComposerImageFiles,
} from "./useComposerImageAttachments.js";

interface TestFile {
  name: string;
  size: number;
  type: string;
}

function file(name: string, type: string, size = 128): TestFile {
  return { name, size, type };
}

describe("selectComposerImageFiles", () => {
  it("reports whether an image attachment slot is available", () => {
    expect(hasComposerImageAttachmentSlot(2, 0)).toBe(true);
    expect(hasComposerImageAttachmentSlot(2, 1)).toBe(false);
    expect(hasComposerImageAttachmentSlot(3, 0)).toBe(false);
  });

  it("accepts image files and ignores non-image files", () => {
    const result = selectComposerImageFiles([
      file("screen.png", "image/png"),
      file("notes.txt", "text/plain"),
    ], 0, 0);

    expect(result.acceptedFiles.map((item) => item.name)).toEqual(["screen.png"]);
    expect(result.error).toBeNull();
    expect(result.selectedImageCount).toBe(1);
  });

  it("rejects oversized images before applying slot limits", () => {
    const result = selectComposerImageFiles([
      file("huge.png", "image/png", MAX_COMPOSER_IMAGE_ATTACHMENT_BYTES + 1),
      file("small.png", "image/png"),
    ], 0, 0);

    expect(result.acceptedFiles.map((item) => item.name)).toEqual(["small.png"]);
    expect(result.error).toBe("Image must be under 4 MB");
  });

  it("respects existing and pending attachment slots", () => {
    const result = selectComposerImageFiles([
      file("one.png", "image/png"),
      file("two.png", "image/png"),
    ], 1, 1);

    expect(result.acceptedFiles.map((item) => item.name)).toEqual(["one.png"]);
    expect(result.error).toBe("Max 3 images");
  });

  it("returns a max-images error when no slots are available", () => {
    const result = selectComposerImageFiles([
      file("screen.png", "image/png"),
    ], 3, 0);

    expect(result.acceptedFiles).toEqual([]);
    expect(result.error).toBe("Max 3 images");
  });
});

describe("typed attachment errors (MP-013/RA-065..RA-066)", () => {
  it("reports too_many and too_large with typed kinds", () => {
    const oversized = selectComposerImageFiles(
      [{ size: 5 * 1024 * 1024, type: "image/png" }],
      0,
      0,
    );
    expect(oversized.errorKind).toBe("too_large");
    expect(oversized.error).toContain("4 MB");

    const full = selectComposerImageFiles(
      [
        { size: 1, type: "image/png" },
        { size: 1, type: "image/png" },
        { size: 1, type: "image/png" },
        { size: 1, type: "image/png" },
      ],
      0,
      0,
    );
    expect(full.errorKind).toBe("too_many");
    expect(full.error).toContain("Max 3 images");
  });

  it("keeps valid attachments when a later file is rejected", () => {
    const selection = selectComposerImageFiles(
      [
        { size: 1, type: "image/png" },
        { size: 9 * 1024 * 1024, type: "image/jpeg" },
      ],
      0,
      0,
    );

    expect(selection.acceptedFiles).toHaveLength(1);
    expect(selection.errorKind).toBe("too_large");
  });

  it("reports no error for a clean selection", () => {
    const selection = selectComposerImageFiles([{ size: 10, type: "image/png" }], 0, 0);

    expect(selection.error).toBeNull();
    expect(selection.errorKind).toBeNull();
  });
});
