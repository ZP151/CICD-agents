import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validationTools } from "../src/tools/validation.js";

describe("validationTools", () => {
  it("returns a structured failure excerpt for failed validation commands", async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-validation-tool-"));
    fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({
      scripts: {
        test: "node -e \"console.error('ERROR validation failed'); process.exit(1)\"",
      },
    }), "utf8");

    const tool = validationTools()[0]!;
    const result = await tool.handler({
      repoPath: repo,
      env: {},
      timeoutSec: 30,
      extra: {},
    }, {
      command: "npm run test",
      kind: "test",
    });

    expect(result.returncode).toBe(1);
    expect(result.summary).toContain("Validation command failed");
    expect(result.failure_excerpt).toContain("ERROR validation failed");
  });
});
