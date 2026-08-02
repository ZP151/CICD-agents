import { describe, expect, it } from "vitest";
import {
  promptDeckKeyboardAction,
  resolvePromptDeckRelease,
} from "./PromptParticleDeck.js";

describe("PromptParticleDeck gestures", () => {
  it("keeps a short, slow drag on the current card", () => {
    expect(resolvePromptDeckRelease(44, 0.18, 7)).toMatchObject({ indexDelta: 0, steps: 0 });
  });

  it("uses distance to move across multiple prompt cards", () => {
    expect(resolvePromptDeckRelease(-316, 0.12, 7)).toMatchObject({ indexDelta: 3, steps: 3 });
  });

  it("uses release velocity as momentum for a quick flick", () => {
    expect(resolvePromptDeckRelease(26, 1.12, 7)).toMatchObject({ indexDelta: -2, steps: 2 });
  });

  it("maps left and right keys to browsing while retaining home and end", () => {
    expect(promptDeckKeyboardAction("ArrowLeft", 7)).toBe(-1);
    expect(promptDeckKeyboardAction("ArrowRight", 7)).toBe(1);
    expect(promptDeckKeyboardAction("Home", 7)).toBe("start");
    expect(promptDeckKeyboardAction("End", 7)).toBe("end");
  });
});
