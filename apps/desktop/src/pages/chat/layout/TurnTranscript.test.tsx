import { describe, expect, it } from "vitest";
import {
  collapseGroupDisclosure,
  commandActivityLabel,
  commandDisclosureKey,
  commandStatusLabel,
  commandTerminalTranscript,
} from "./TurnTranscript.js";

describe("TurnTranscript disclosure rules (MP-004/RA-013)", () => {
  it("collapses children together with their parent group", () => {
    const openCommands = {
      [commandDisclosureKey("g1", "c1")]: true,
      [commandDisclosureKey("g1", "c2")]: true,
      [commandDisclosureKey("g2", "c1")]: true,
    };

    const next = collapseGroupDisclosure({ g1: true }, openCommands, "g1", ["c1", "c2"]);

    expect(next.openGroups).toEqual({ g1: false });
    expect(next.openCommands).toEqual({ [commandDisclosureKey("g2", "c1")]: true });
  });

  it("re-expanding a group restores a clean default with children closed", () => {
    const next = collapseGroupDisclosure({}, {}, "g1", ["c1"]);

    expect(next.openGroups).toEqual({ g1: true });
    expect(next.openCommands).toEqual({});
  });

  it("keeps children disclosure scoped to their own group", () => {
    expect(commandDisclosureKey("g1", "c1")).not.toBe(commandDisclosureKey("g2", "c1"));
  });
});

describe("TurnTranscript command labels (MP-004/RA-014)", () => {
  it("exposes the real exit code on failed commands", () => {
    expect(commandStatusLabel("failed", 1)).toBe("Failed · exit 1");
    expect(commandStatusLabel("failed")).toBe("Failed");
    expect(commandStatusLabel("running")).toBe("Running");
    expect(commandStatusLabel("succeeded")).toBe("Success");
    expect(commandStatusLabel("cancelled")).toBe("Cancelled");
  });

  it("builds activity labels and transcript text with duration", () => {
    expect(commandActivityLabel("npm test", 30_000)).toBe("Ran npm test in 30s");
    expect(commandActivityLabel(undefined)).toBe("Ran command");
    expect(commandTerminalTranscript("git status", "## main")).toBe("$ git status\n## main");
  });
});
