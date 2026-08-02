import { describe, expect, it } from "vitest";
import { commandCodeViewerSetup, copyCommandText, terminalOutputLineTone } from "./CommandCodeViewer.js";

describe("CommandCodeViewer", () => {
  it("keeps command input compact but restores a numbered gutter for output", () => {
    expect(commandCodeViewerSetup(false).lineNumbers).toBe(false);
    expect(commandCodeViewerSetup(true).lineNumbers).toBe(true);
  });

  it("fails safely when clipboard APIs are unavailable during non-browser rendering", async () => {
    await expect(copyCommandText("git status --short")).resolves.toBe(false);
  });

  it("gives PowerShell diagnostics stable terminal semantics", () => {
    expect(terminalOutputLineTone("Get-Content:")).toBe("error");
    expect(terminalOutputLineTone("Line |")).toBe("context");
    expect(terminalOutputLineTone("   2 | Get-Content missing-file")).toBe("context");
    expect(terminalOutputLineTone("       ~~~~~~~~~~~~~~~~~~~~~~")).toBe("error");
    expect(terminalOutputLineTone("Cannot find path 'C:\\repo\\missing-file'.")).toBe("error");
    expect(terminalOutputLineTone("plain stdout")).toBeNull();
  });
});
