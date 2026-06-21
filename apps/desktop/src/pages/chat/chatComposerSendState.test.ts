import { describe, expect, it } from "vitest";
import { canSendComposerTurn } from "./chatComposerSendState.js";

describe("canSendComposerTurn", () => {
  it("allows ordinary text sends when the composer is enabled", () => {
    expect(canSendComposerTurn({
      controlsDisabled: false,
      sendDisabled: false,
      message: "Review my changes",
      imageAttachmentCount: 0,
    })).toBe(true);
  });

  it("allows image-only sends when the only missing input is text", () => {
    expect(canSendComposerTurn({
      controlsDisabled: false,
      sendDisabled: true,
      message: "",
      imageAttachmentCount: 1,
    })).toBe(true);
  });

  it("keeps controls disabled states authoritative even with images", () => {
    expect(canSendComposerTurn({
      controlsDisabled: true,
      sendDisabled: true,
      message: "",
      imageAttachmentCount: 1,
    })).toBe(false);
  });

  it("blocks sends while images are still being prepared", () => {
    expect(canSendComposerTurn({
      controlsDisabled: false,
      sendDisabled: false,
      message: "What is in this screenshot?",
      imageAttachmentCount: 0,
      pendingImageAttachmentCount: 1,
    })).toBe(false);
    expect(canSendComposerTurn({
      controlsDisabled: false,
      sendDisabled: true,
      message: "",
      imageAttachmentCount: 1,
      pendingImageAttachmentCount: 1,
    })).toBe(false);
  });

  it("blocks empty sends without text or images", () => {
    expect(canSendComposerTurn({
      controlsDisabled: false,
      sendDisabled: true,
      message: "",
      imageAttachmentCount: 0,
    })).toBe(false);
  });
});
