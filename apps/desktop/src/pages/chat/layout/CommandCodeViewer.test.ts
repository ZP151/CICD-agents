import { describe, expect, it } from "vitest";
import { commandCodeViewerSetup } from "./CommandCodeViewer.js";

describe("CommandCodeViewer", () => {
  it("keeps command input compact but restores a numbered gutter for output", () => {
    expect(commandCodeViewerSetup(false).lineNumbers).toBe(false);
    expect(commandCodeViewerSetup(true).lineNumbers).toBe(true);
  });
});
