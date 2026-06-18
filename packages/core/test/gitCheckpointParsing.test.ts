import { describe, expect, it } from "vitest";
import {
  checkpointFilesFromDiff,
  pathsFromPorcelainStatus,
} from "../src/tools/gitCheckpointParsing.js";

describe("git checkpoint parsing", () => {
  it("extracts unique sorted checkpoint files from binary diff headers", () => {
    expect(checkpointFilesFromDiff([
      "diff --git a/src/b.ts b/src/b.ts",
      "index 123..456 100644",
      "diff --git a/src/a.ts b/src/a.ts",
      "diff --git a/src/b.ts b/src/b.ts",
    ].join("\n"))).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("splits porcelain status into tracked and untracked rollback paths", () => {
    expect(pathsFromPorcelainStatus([
      "## feature/demo",
      " M src/modified.ts",
      "R  old.ts -> src/renamed.ts",
      "A  src/added.ts",
      "?? scratch.txt",
    ].join("\n"))).toEqual({
      tracked: ["src/added.ts", "src/modified.ts", "src/renamed.ts"],
      untracked: ["scratch.txt"],
    });
  });
});
