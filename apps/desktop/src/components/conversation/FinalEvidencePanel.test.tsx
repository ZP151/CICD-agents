import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinalEvidencePanel } from "./FinalEvidencePanel.js";

describe("FinalEvidencePanel (MP-003)", () => {
  it("renders nothing without evidence references", () => {
    expect(renderToStaticMarkup(<FinalEvidencePanel />)).toBe("");
    expect(renderToStaticMarkup(<FinalEvidencePanel evidence={[]} />)).toBe("");
  });

  it("shows collapsed tool names and expands to bounded summaries", () => {
    const html = renderToStaticMarkup(
      <FinalEvidencePanel
        evidence={[
          { tool: "git_status", ok: true, callId: "call-1", summary: "Working tree: clean." },
          { tool: "git_current_branch", ok: true, callId: "call-2", summary: "Active branch: `main`." },
        ]}
      />,
    );

    expect(html).toContain("Evidence");
    expect(html).toContain("git_status, git_current_branch");
    expect(html).toContain('aria-expanded="false"');
    // Summaries are hidden until expanded; only the collapsed ids are visible.
    expect(html).not.toContain("Working tree: clean.");
  });
});
