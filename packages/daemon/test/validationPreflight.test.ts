import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  changedFilesFromGitOutputs,
  focusedValidationPreflightFromSession,
  validationPreflightFromPayload,
} from "../src/workflows/validationPreflight.js";

function tempRepo(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("validationPreflight", () => {
  it("combines diff and porcelain status paths", () => {
    expect(changedFilesFromGitOutputs(
      "src/a.ts\n",
      [
        "## main",
        " M src/b.ts",
        "R  old.ts -> src/new.ts",
        "?? src/c.ts",
      ].join("\n"),
    )).toEqual(["src/a.ts", "src/b.ts", "src/new.ts", "src/c.ts"]);
  });

  it("prefers focused rerun commands from matching validation artifacts", async () => {
    const preflight = await focusedValidationPreflightFromSession({
      async getBubbles() {
        return [{
          role: "assistant",
          artifacts: [{
            artifactId: "validation-test-failed-focused",
            artifactType: "markdown",
            status: "error",
            content: "- Candidate rerun: `npm test -- src.test.ts`",
          }],
        }];
      },
    }, {
      repoPath: tempRepo("cicd-validation-preflight-artifact-"),
      sessionId: "session-1",
      projectLink: { buildCommand: "npm run build", testCommand: "npm test" },
    }, "test", ["src.test.ts"]);

    expect(preflight).toMatchObject({
      kind: "validation",
      status: "ready",
      validationKind: "test",
      commandSource: "artifact",
      command: "npm test -- src.test.ts",
      changedFiles: ["src.test.ts"],
    });
  });
});
