import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionCommandRow, executionCommandLabelClass } from "./ExecutionCommandRow.js";

describe("ExecutionCommandRow", () => {
  it("uses a neutral fallback when a tool row has no tool name", () => {
    const html = renderToStaticMarkup(
      <ExecutionCommandRow
        item={{
          id: "tool-1",
          state: "result",
          ok: true,
          output: { stdout: "done", returncode: 0 },
          open: true,
        }}
        onToggleItem={() => undefined}
      />,
    );

    expect(html).toContain("Ran command");
    expect(html).toContain("Collapse tool details");
    expect(html).not.toContain("unknown");
  });

  it("keeps long command labels bounded by the transcript column", () => {
    const className = executionCommandLabelClass();

    expect(className).toContain("min-w-0");
    expect(className).toContain("max-w-full");
    expect(className).toContain("truncate");
    expect(className).not.toContain("max-w-[42rem]");
  });
});
