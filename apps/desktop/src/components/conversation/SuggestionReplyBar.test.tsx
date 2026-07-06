import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  SuggestionReplyBar,
  suggestionReplyButtonState,
} from "./SuggestionReplyBar.js";

describe("SuggestionReplyBar", () => {
  const workspaceSuggestion = {
    id: "pr-rerun-validation",
    label: "Rerun validation",
    message: "Rerun relevant validation.",
    action: { kind: "workspace_action" as const, action: "run_tests" as const },
  };
  const recoverySuggestion = {
    id: "git-abort-rebase",
    label: "Abort rebase",
    message: "Abort the in-progress rebase.",
    action: { kind: "workspace_action" as const, action: "abort_rebase" as const },
  };

  it("renders suggestion buttons", () => {
    const html = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[
          { id: "a", label: "Key files", message: "Show key files", action: { kind: "fill_composer" } },
          { id: "b", label: "Request flow", message: "Explain request flow", action: { kind: "fill_composer" } },
        ]}
        onPick={() => undefined}
      />,
    );

    expect(html).toContain("Key files");
    expect(html).toContain("Request flow");
    expect(html).toContain("Show key files");
    expect(html).toContain('data-action-kind="fill_composer"');
  });

  it("marks workspace and approval suggestions with action kind hooks", () => {
    const html = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[
          {
            id: "a",
            label: "Detailed diff",
            message: "Inspect current changes",
            action: { kind: "workspace_action", action: "inspect_changes" },
          },
          {
            id: "b",
            label: "Stage selected",
            message: "Stage selected files",
            action: { kind: "requires_approval", reason: "Staging writes to the Git index." },
          },
        ]}
        onPick={() => undefined}
      />,
    );

    expect(html).toContain('data-action-kind="workspace_action"');
    expect(html).toContain('data-action-kind="requires_approval"');
  });

  it("derives visible suggestion button state from workflow context", () => {
    expect(suggestionReplyButtonState(workspaceSuggestion, undefined)).toBe("idle");
    expect(suggestionReplyButtonState(workspaceSuggestion, { workflowStatus: "running" })).toBe("running");
    expect(suggestionReplyButtonState(workspaceSuggestion, { queuedSuggestionId: workspaceSuggestion.id })).toBe("queued");
    expect(suggestionReplyButtonState(workspaceSuggestion, { blocked: true })).toBe("blocked");
  });

  it("marks running suggestions as queueable without disabling them", () => {
    const html = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[workspaceSuggestion]}
        onPick={() => undefined}
        state={{ workflowStatus: "running" }}
      />,
    );

    expect(html).toContain('data-suggestion-state="running"');
    expect(html).toContain("Queue");
    expect(html).toContain("Queue after current workflow");
    expect(html).not.toContain('disabled=""');
  });

  it("marks queued and blocked suggestions as disabled stateful actions", () => {
    const queuedHtml = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[workspaceSuggestion]}
        onPick={() => undefined}
        state={{ queuedSuggestionId: workspaceSuggestion.id }}
      />,
    );
    const blockedHtml = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[workspaceSuggestion]}
        onPick={() => undefined}
        state={{ blocked: true, blockedReason: "Resolve git conflicts first." }}
      />,
    );

    expect(queuedHtml).toContain('data-suggestion-state="queued"');
    expect(queuedHtml).toContain("Queued");
    expect(queuedHtml).toContain("disabled");
    expect(blockedHtml).toContain('data-suggestion-state="blocked"');
    expect(blockedHtml).toContain("Blocked");
    expect(blockedHtml).toContain("Resolve git conflicts first.");
    expect(blockedHtml).toContain("disabled");
  });

  it("keeps Git recovery suggestions enabled while workflow is blocked", () => {
    const html = renderToStaticMarkup(
      <SuggestionReplyBar
        suggestions={[recoverySuggestion]}
        onPick={() => undefined}
        state={{ blocked: true, blockedReason: "Resolve git conflicts first." }}
      />,
    );

    expect(suggestionReplyButtonState(recoverySuggestion, { blocked: true })).toBe("idle");
    expect(html).toContain('data-suggestion-state="idle"');
    expect(html).not.toContain("Blocked");
    expect(html).not.toContain('disabled=""');
  });
});
