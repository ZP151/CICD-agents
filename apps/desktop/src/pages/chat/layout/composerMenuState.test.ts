import { describe, expect, it } from "vitest";
import {
  toggleAttachmentMenuState,
  toggleModelMenuState,
} from "./composerMenuState.js";

describe("composer menu state", () => {
  it("closes the model menu when the attachment menu opens", () => {
    expect(toggleAttachmentMenuState({
      attachmentMenuOpen: false,
      modelMenuOpen: true,
    })).toEqual({
      attachmentMenuOpen: true,
      modelMenuOpen: false,
    });
  });

  it("closes the attachment menu when the model menu opens", () => {
    expect(toggleModelMenuState({
      attachmentMenuOpen: true,
      modelMenuOpen: false,
    })).toEqual({
      attachmentMenuOpen: false,
      modelMenuOpen: true,
    });
  });

  it("keeps the other menu state when closing the active menu", () => {
    expect(toggleAttachmentMenuState({
      attachmentMenuOpen: true,
      modelMenuOpen: false,
    })).toEqual({
      attachmentMenuOpen: false,
      modelMenuOpen: false,
    });

    expect(toggleModelMenuState({
      attachmentMenuOpen: false,
      modelMenuOpen: true,
    })).toEqual({
      attachmentMenuOpen: false,
      modelMenuOpen: false,
    });
  });
});
