import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ExecutionCommandRow } from "./ExecutionCommandRow.js";

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
});
