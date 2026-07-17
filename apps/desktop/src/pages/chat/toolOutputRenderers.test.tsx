import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolOutputRenderer } from "./toolOutputRenderers.js";

describe("ToolOutputRenderer", () => {
  it("uses a readable fallback when git status output has no branch line", () => {
    const html = renderToStaticMarkup(
      <ToolOutputRenderer
        toolName="git_status"
        toolResult={{ stdout: " M src/app.ts\n", returncode: 0 }}
      />,
    );

    expect(html).toContain("Branch not available");
    expect(html).not.toContain("unknown");
  });
});
