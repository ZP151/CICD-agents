import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWorkspaceFile, WorkspaceFilePreviewError } from "./workspace.js";

describe("fetchWorkspaceFile", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns workspace file preview metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      path: "src/app.ts",
      content: "export const value = 1;\n",
      size: 23,
      lineCount: 2,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(fetchWorkspaceFile("C:\\repo", "src/app.ts")).resolves.toEqual({
      path: "src/app.ts",
      content: "export const value = 1;\n",
      size: 23,
      lineCount: 2,
    });
  });

  it("maps large file responses to a concise preview error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "file too large",
      maxBytes: 786432,
      size: 1000000,
    }), {
      status: 413,
      headers: { "content-type": "application/json" },
    })));

    await expect(fetchWorkspaceFile("C:\\repo", "large.log")).rejects.toMatchObject({
      name: "WorkspaceFilePreviewError",
      message: "File is too large to preview.",
      status: 413,
    } satisfies Partial<WorkspaceFilePreviewError>);
  });

  it("maps binary file responses to a concise preview error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: "binary file preview is not supported",
    }), {
      status: 415,
      headers: { "content-type": "application/json" },
    })));

    await expect(fetchWorkspaceFile("C:\\repo", "image.png")).rejects.toMatchObject({
      name: "WorkspaceFilePreviewError",
      message: "Binary file preview is not supported.",
      status: 415,
    } satisfies Partial<WorkspaceFilePreviewError>);
  });
});
