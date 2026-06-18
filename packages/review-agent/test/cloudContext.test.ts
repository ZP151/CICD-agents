import { describe, expect, it, vi } from "vitest";
import { buildCloudContext, type AdoClient } from "@mergepilot/core";

describe("cloud context", () => {
  it("enriches changed files with Azure DevOps file diff hunks", async () => {
    const ado = {
      getPullRequestChanges: vi.fn(async () => ({
        changeEntries: [{
          changeType: "edit",
          item: { path: "/src/app.ts" },
        }],
      })),
      getItemContent: vi.fn(async () => "export function add(a: number, b: number) {\n  return a - b;\n}\n"),
      getFileDiffs: vi.fn(async () => ([{
        path: "src/app.ts",
        lineDiffBlocks: [{
          changeType: "edit",
          originalLineNumberStart: 2,
          originalLinesCount: 1,
          modifiedLineNumberStart: 2,
          modifiedLinesCount: 1,
          originalLines: ["  return a + b;"],
          modifiedLines: ["  return a - b;"],
        }],
      }])),
    } as unknown as AdoClient;

    const bundle = await buildCloudContext({
      ado,
      project: "Agents",
      repositoryId: "mergepilot",
      prId: 42,
      iterationId: 3,
      sourceCommit: "source",
      baseCommit: "base",
    });

    expect(ado.getFileDiffs).toHaveBeenCalledWith("Agents", "mergepilot", {
      baseVersionCommit: "base",
      targetVersionCommit: "source",
      fileDiffParams: [{ path: "src/app.ts", originalPath: "src/app.ts" }],
    });
    expect(bundle.files[0]?.hunks).toEqual([{
      changeType: "edit",
      originalStart: 2,
      originalLineCount: 1,
      modifiedStart: 2,
      modifiedLineCount: 1,
      originalLines: ["  return a + b;"],
      modifiedLines: ["  return a - b;"],
    }]);
  });
});
