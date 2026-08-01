import { describe, expect, it } from "vitest";
import { commandActivityLabel, commandTerminalTranscript } from "./TurnTranscript.js";

describe("TurnTranscript command presentation", () => {
  it("keeps the command summary generic while retaining duration", () => {
    expect(commandActivityLabel()).toBe("Ran command");
    expect(commandActivityLabel(1_240)).toBe("Ran command in 1s");
  });

  it("renders the executed command and its real response in one terminal transcript", () => {
    expect(commandTerminalTranscript("git branch --show-current", "main")).toBe("$ git branch --show-current\nmain");
  });
});
