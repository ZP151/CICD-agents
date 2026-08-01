import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveTurnRepoPath } from "../src/chatSessionRun.js";

describe("Project Link Turn target", () => {
  it("uses the selected Project Link fixture instead of the MergePilot workspace", () => {
    const projectLinkFixture = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-project-link-fixture-"));
    fs.writeFileSync(path.join(projectLinkFixture, "README.md"), "# Project Link fixture\n", "utf8");

    expect(resolveTurnRepoPath(process.cwd(), { repoPath: projectLinkFixture })).toBe(projectLinkFixture);
    expect(resolveTurnRepoPath(projectLinkFixture, { repoPath: "" })).toBe(projectLinkFixture);
  });
});
