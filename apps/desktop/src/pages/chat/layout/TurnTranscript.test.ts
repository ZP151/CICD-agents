import { describe, expect, it } from "vitest";
import { commandActivityLabel, commandDisclosureKey, commandTerminalTranscript } from "./TurnTranscript.js";

describe("TurnTranscript command presentation", () => {
  it("shows a compact real command summary while retaining duration", () => {
    expect(commandActivityLabel()).toBe("Ran command");
    expect(commandActivityLabel("git status --short", 1_240)).toBe("Ran git status --short in 1s");
  });

  it("renders the executed command and its real response in one terminal transcript", () => {
    expect(commandTerminalTranscript("git branch --show-current", "main")).toBe("$ git branch --show-current\nmain");
  });

  it("scopes duplicate command ids to their own action groups", () => {
    expect(commandDisclosureKey("inspect-branch", "status")).toBe("inspect-branch:status");
    expect(commandDisclosureKey("inspect-diff", "status")).toBe("inspect-diff:status");
  });
});
