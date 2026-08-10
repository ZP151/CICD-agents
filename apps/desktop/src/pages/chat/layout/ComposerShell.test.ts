import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ComposerShell,
  composerAttachmentChipClass,
  composerBottomControlsClass,
  composerModelButtonClass,
  composerModelLabelClass,
  composerModelMenuClass,
  composerShellClass,
} from "./ComposerShell.js";

describe("ComposerShell layout classes", () => {
  it("keeps controls shrinkable and removes the redundant composer divider", () => {
    expect(composerShellClass()).toContain("input-panel");
    expect(composerShellClass()).not.toContain("border-t");
    expect(composerBottomControlsClass()).toContain("min-w-0");
  });

  it("bounds model controls and menus to the visible viewport", () => {
    expect(composerModelButtonClass()).toContain("max-w-full");
    expect(composerModelButtonClass()).toContain("min-w-0");
    expect(composerModelButtonClass()).toContain("max-[900px]:min-h-9");
    expect(composerModelLabelClass()).toContain("max-w-[min(12rem,45vw)]");
    expect(composerModelLabelClass()).toContain("truncate");
    expect(composerModelMenuClass()).toContain("w-[min(16rem,calc(100vw-2rem))]");
    expect(composerModelMenuClass()).not.toContain("w-64");
  });

  it("keeps image attachment chips inside the composer", () => {
    expect(composerAttachmentChipClass()).toContain("max-w-[min(220px,100%)]");
    expect(composerAttachmentChipClass()).toContain("min-w-0");
    expect(composerAttachmentChipClass()).not.toContain("max-w-[220px]");
  });

  it("announces the model menu and its selected option to assistive technology", () => {
    const html = renderToStaticMarkup(
      createElement(ComposerShell, {
        mini: true,
        input: "",
        textareaRef: createRef<HTMLTextAreaElement>(),
        modelMenuRef: createRef<HTMLDivElement>(),
        modelMenuOpen: true,
        activeModel: "custom-model",
        activeCustomModel: { id: "custom-model", label: "Review model", provider: "openai" },
        customModels: [{ id: "custom-model", label: "Review model", provider: "openai" }],
        availableProjectLinks: [],
        projectLinksLoading: false,
        activeProjectLinkId: null,
        composerStateNotice: null,
        composerInputState: {
          inputDisabled: false,
          sendDisabled: false,
          controlsDisabled: false,
          placeholder: "Ask MergePilot...",
        },
        suggestionReplies: [],
        busy: false,
        workflowState: null,
        queuedSuggestionId: null,
        onInputChange: () => undefined,
        onSend: () => undefined,
        onStop: () => undefined,
        onCancelQueuedSuggestion: () => undefined,
        onSuggestionPick: () => undefined,
        onModelMenuOpenChange: () => undefined,
        onActiveModelChange: () => undefined,
      }),
    );

    expect(html).toContain('aria-label="Conversation model"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('role="menuitemradio"');
    expect(html).toContain('aria-checked="true"');
  });
});
