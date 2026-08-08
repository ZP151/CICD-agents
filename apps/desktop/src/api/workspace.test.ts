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

  it("maps unknown preview failures to a concise fallback without HTTP status text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));

    await expect(fetchWorkspaceFile("C:\\repo", "src/app.ts")).rejects.toMatchObject({
      name: "WorkspaceFilePreviewError",
      message: "Workspace file preview failed.",
      status: 500,
    } satisfies Partial<WorkspaceFilePreviewError>);
    await expect(fetchWorkspaceFile("C:\\repo", "src/app.ts")).rejects.not.toThrow("HTTP 500");
  });
});

describe("fetchWorkspaceFile typed errors (MP-008/RA-031..RA-033)", () => {
  it("maps 403 permission failures distinctly from missing files", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "permission denied reading file" }), {
      status: 403,
      headers: { "content-type": "application/json" },
    })));

    await expect(fetchWorkspaceFile("C:\repo", "secret\file.ts")).rejects.toThrow(
      "Permission denied while reading this file.",
    );
    await expect(fetchWorkspaceFile("C:\repo", "secret\file.ts")).rejects.not.toThrow("File not found");
  });

  it("maps 404 to a missing-or-deleted message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "file not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })));

    await expect(fetchWorkspaceFile("C:\repo", "gone.ts")).rejects.toThrow(
      "File not found or has been deleted.",
    );
  });
});
