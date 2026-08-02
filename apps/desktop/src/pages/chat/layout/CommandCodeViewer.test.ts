import { describe, expect, it } from "vitest";
import { commandCodeViewerSetup, copyCommandText } from "./CommandCodeViewer.js";

describe("CommandCodeViewer", () => {
  it("keeps command input compact but restores a numbered gutter for output", () => {
    expect(commandCodeViewerSetup(false).lineNumbers).toBe(false);
    expect(commandCodeViewerSetup(true).lineNumbers).toBe(true);
  });

  it("fails safely when clipboard APIs are unavailable during non-browser rendering", async () => {
    await expect(copyCommandText("git status --short")).resolves.toBe(false);
  });
});
