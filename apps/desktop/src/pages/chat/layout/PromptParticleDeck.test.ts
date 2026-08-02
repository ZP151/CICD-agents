import { describe, expect, it } from "vitest";
import {
  promptDeckContinuationOffset,
  promptDeckInertiaDuration,
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

  it("keeps a short drag local but lets a long drag glide across every selected card", () => {
    expect(promptDeckContinuationOffset(-40, 0, 205)).toBe(-40);
    expect(promptDeckContinuationOffset(-100, 1, 205)).toBe(105);
    expect(promptDeckContinuationOffset(-300, 3, 205)).toBe(315);
    expect(promptDeckContinuationOffset(40, -2, 146)).toBe(-252);
  });

  it("uses a longer non-bouncy coast for a larger continuation distance", () => {
    expect(promptDeckInertiaDuration(40, 0.12)).toBeGreaterThanOrEqual(0.28);
    expect(promptDeckInertiaDuration(340, 1.2)).toBeGreaterThan(promptDeckInertiaDuration(40, 0.12));
    expect(promptDeckInertiaDuration(4000, 8)).toBe(0.72);
  });

  it("maps left and right keys to browsing while retaining home and end", () => {
    expect(promptDeckKeyboardAction("ArrowLeft", 7)).toBe(-1);
    expect(promptDeckKeyboardAction("ArrowRight", 7)).toBe(1);
    expect(promptDeckKeyboardAction("Left", 7)).toBe(-1);
    expect(promptDeckKeyboardAction("Right", 7)).toBe(1);
    expect(promptDeckKeyboardAction("Home", 7)).toBe("start");
    expect(promptDeckKeyboardAction("End", 7)).toBe("end");
  });
});
