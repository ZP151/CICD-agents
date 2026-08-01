import { describe, expect, it } from "vitest";
import { storedPublicToolResult } from "../src/chatPublicToolEvidence.js";

describe("chat planner compatibility persistence", () => {
  it("keeps only public, bounded evidence and preserves branch continuation data", () => {
    const branch = storedPublicToolResult("git_current_branch", true, "branch read", "feature/public-transcript");
    const connector = storedPublicToolResult("mcp_connector", false, "request failed", "***REDACTED***");

    expect(branch).toEqual({
      ok: true,
      summary: "branch read",
      output: "feature/public-transcript",
      stdout: "feature/public-transcript",
    });
    expect(connector).toEqual({ ok: false, summary: "request failed", output: "***REDACTED***" });
    expect(JSON.stringify(connector)).not.toContain("toolResult");
  });
});
