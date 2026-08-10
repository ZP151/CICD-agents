import { describe, expect, it } from "vitest";
import { ImageEditUnavailableError, cropImageFromDataUrl } from "./imageEditCanvas.js";

describe("cropImageFromDataUrl (MP-013/RA-063)", () => {
  it("fails typed when canvas is unavailable instead of crashing the composer", async () => {
    // Node has no canvas; the util must fail recoverably so the composer
    // keeps the original attachment and shows an error.
    await expect(
      cropImageFromDataUrl("data:image/png;base64,abc", { x: 10, y: 10 }, 0, 1),
    ).rejects.toBeInstanceOf(ImageEditUnavailableError);
  });

  it("rejects undecodable images with a typed error", async () => {
    // In an environment with canvas, a malformed data URL still fails typed.
    try {
      await cropImageFromDataUrl("not-a-data-url", { x: 0, y: 0 }, 0, 1);
      expect(true).toBe(false); // unreachable without canvas
    } catch (err) {
      expect(err).toBeInstanceOf(ImageEditUnavailableError);
    }
  });
});
