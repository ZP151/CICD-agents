import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TaskView } from "../../api.js";
import { TaskRunDetailPanel } from "./TaskRunDetailPanel.js";

function taskView(detail: string): TaskView {
  return {
    id: "task-1",
    status: "done",
    kind: "workflow",
    payload: { title: "Review changes" },
    result: null,
    error: "",
    createdAt: 1_786_000_000,
    finishedAt: 1_786_000_100,
    steps: [
      {
        seq: 1,
        name: "git_status",
        status: "done",
        detail,
        createdAt: 1_786_000_000,
      },
    ],
  };
}

describe("TaskRunDetailPanel", () => {
  it("folds JSON-like step details by default", () => {
    const html = renderToStaticMarkup(
      <TaskRunDetailPanel
        task={taskView(
          '{"returncode":0,"stdout":"## feature/demo...origin/feature/demo\\nM README.md","stderr":""}',
        )}
      />,
    );

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("## feature/demo...origin/feature/demo");
    expect(html).toContain("Raw output");
    expect(html).toContain("&quot;returncode&quot;:0");
  });

  it("keeps short human step details inline", () => {
    const html = renderToStaticMarkup(<TaskRunDetailPanel task={taskView("2 files modified")} />);

    expect(html).not.toContain("<details");
    expect(html).toContain("2 files modified");
  });
});
