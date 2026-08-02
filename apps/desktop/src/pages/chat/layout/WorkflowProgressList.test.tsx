import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkflowProgressList } from "./WorkflowProgressList.js";

describe("WorkflowProgressList", () => {
  it("keeps workflow state visible and puts action guidance on the accessible name", () => {
    const html = renderToStaticMarkup(
      <WorkflowProgressList
        taskState={{
          goal: "Review the local changes",
          currentStepLabel: "Inspect changes",
          steps: [{ label: "Inspect changes", action: { type: "inspect_changes" }, active: true, done: false }],
          details: [],
        }}
        workflowState={null}
        busy={false}
        onAction={() => undefined}
      />,
    );

    expect(html).toContain("Inspect changes");
    expect(html).toContain('aria-label="Run inspect changes"');
    expect(html).toContain('data-workflow-step-state="idle"');
    expect(html).not.toContain("title=");
  });
});
