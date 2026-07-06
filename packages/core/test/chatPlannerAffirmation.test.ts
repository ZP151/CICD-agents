import { describe, expect, it } from "vitest";
import { isConfirmationMessage } from "../src/chatPlannerAffirmation.js";

describe("chat planner affirmation detection", () => {
  it("treats explicit approvals as confirmations", () => {
    expect(isConfirmationMessage("yes")).toBe(true);
    expect(isConfirmationMessage("go ahead")).toBe(true);
    expect(isConfirmationMessage("run it")).toBe(true);
    expect(isConfirmationMessage("please commit")).toBe(true);
  });

  it("does not treat revised approval feedback as confirmation", () => {
    expect(isConfirmationMessage(
      "Actually stage only notes.txt instead. Do not stage README.md. Do not commit or push.",
    )).toBe(false);
    expect(isConfirmationMessage("Stage notes.txt instead, don't commit or push.")).toBe(false);
  });
});
