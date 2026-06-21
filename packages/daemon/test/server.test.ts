import { describe, expect, it, afterEach, beforeAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";
import { loadSession } from "../src/chatHistoryStore.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-"));
  process.env.RUNTIME_DATA_DIR = tmp;
  process.env.RUNTIME_HOST = "127.0.0.1";
  process.env.RUNTIME_PORT = "0";
  process.env.AZURE_OPENAI_ENDPOINT = "";
  process.env.AZURE_OPENAI_API_KEY = "";
  process.env.AZURE_COSMOS_ENDPOINT = "";
  process.env.AZURE_STORAGE_ACCOUNT = "";
  process.env.AZURE_KEYVAULT_URL = "";
  resetSettingsForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (app) {
    await app.close();
    app = null;
  }
});

describe("daemon HTTP", () => {
  it("serves repository-relative workspace file previews", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-workspace-file-"));
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "app.ts"), "export const value = 1;\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/workspace/file",
      payload: {
        repoPath: repo,
        filePath: "src/app.ts",
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      path: "src/app.ts",
      content: "export const value = 1;\n",
      lineCount: 2,
    });
  });

  it("rejects workspace file previews outside the selected repository", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-workspace-file-"));

    const response = await app.inject({
      method: "POST",
      url: "/workspace/file",
      payload: {
        repoPath: repo,
        filePath: "../outside.txt",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("repository-relative");
  });

  it("rejects workspace file previews for large text files", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-workspace-file-large-"));
    fs.writeFileSync(path.join(repo, "large.log"), "a".repeat(800 * 1024), "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/workspace/file",
      payload: {
        repoPath: repo,
        filePath: "large.log",
      },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toMatchObject({
      error: "file too large",
    });
  });

  it("rejects workspace file previews for binary files", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-workspace-file-binary-"));
    fs.writeFileSync(path.join(repo, "image.bin"), Buffer.from([0x89, 0x50, 0x00, 0x47]));

    const response = await app.inject({
      method: "POST",
      url: "/workspace/file",
      payload: {
        repoPath: repo,
        filePath: "image.bin",
      },
    });

    expect(response.statusCode).toBe(415);
    expect(response.json()).toMatchObject({
      error: "binary file preview is not supported",
    });
  });

  it("continues structured commit workflow from stage approval to commit approval", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-commit-next-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/demo"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");

    const prepare = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "prepare_commit",
        repoPath: repo,
        includeUnstaged: true,
        commitMode: "commit",
        message: "docs: update readme",
      },
    });
    expect(prepare.statusCode, prepare.body).toBe(200);
    const prepared = prepare.json() as {
      sessionId: string;
      workflowState: {
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: { action: { tool: string; workflow?: unknown } };
      };
    };
    expect(prepared.workflowState.workflowKind).toBe("commit");
    expect(prepared.workflowState.workflowPhase).toBe("waiting_for_stage_approval");
    expect(prepared.workflowState.pendingApproval?.action.tool).toBe("git_add");
    expect(prepared.workflowState.pendingApproval?.action.workflow).toMatchObject({
      kind: "commit",
      phase: "stage",
      branch: "feature/demo",
      message: "docs: update readme",
    });

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const approval = events.find((entry) => entry.event === "approval_required")?.data as
      | {
          approval?: {
            action?: { tool?: string; args?: Record<string, unknown>; workflow?: unknown };
          };
        }
      | undefined;
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { workflowKind?: string; workflowPhase?: string } }
      | undefined;
    expect(workflowEvent?.state?.workflowKind).toBe("commit");
    expect(workflowEvent?.state?.workflowPhase).toBe("waiting_for_commit_approval");
    expect(approval?.approval?.action?.tool).toBe("git_commit");
    expect(approval?.approval?.action?.args).toEqual({ message: "docs: update readme" });
    expect(approval?.approval?.action?.workflow).toMatchObject({
      kind: "commit",
      phase: "commit",
      branch: "feature/demo",
      message: "docs: update readme",
      pushAfterCommit: false,
    });
  });

  it("generates a structured commit approval after staging when the commit message is blank", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-commit-generate-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/generated-message"], {
      cwd: repo,
      encoding: "utf8",
    });
    fs.writeFileSync(path.join(repo, "README.md"), "# generated\n", "utf8");

    const prepare = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "prepare_commit",
        repoPath: repo,
        includeUnstaged: true,
        commitMode: "commit",
      },
    });
    expect(prepare.statusCode, prepare.body).toBe(200);
    const prepared = prepare.json() as {
      sessionId: string;
      workflowState: {
        workflowPhase?: string;
        pendingApproval?: { action: { tool: string; nextHint?: string } };
      };
    };
    expect(prepared.workflowState.workflowPhase).toBe("waiting_for_stage_approval");
    expect(prepared.workflowState.pendingApproval?.action.tool).toBe("git_add");
    expect(prepared.workflowState.pendingApproval?.action.nextHint).toContain(
      "generate a concise commit message",
    );

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const approval = events.find((entry) => entry.event === "approval_required")?.data as
      | {
          approval?: {
            action?: {
              tool?: string;
              args?: Record<string, unknown>;
              description?: string;
              workflow?: unknown;
            };
          };
        }
      | undefined;
    expect(approval?.approval?.action?.tool).toBe("git_commit");
    expect(approval?.approval?.action?.args).toEqual({ message: "docs: add readme" });
    expect(approval?.approval?.action?.description).toContain("generated message");
    expect(approval?.approval?.action?.workflow).toMatchObject({
      kind: "commit",
      phase: "commit",
      branch: "feature/generated-message",
      message: "docs: add readme",
      pushAfterCommit: false,
    });
  });

  it("continues structured commit-and-push workflow from commit approval to push approval", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-workflow-push-next-"));
    spawnSync("git", ["init"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["checkout", "-b", "feature/publish"], { cwd: repo, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "mergepilot@example.test"], {
      cwd: repo,
      encoding: "utf8",
    });
    spawnSync("git", ["config", "user.name", "MergePilot"], { cwd: repo, encoding: "utf8" });
    fs.writeFileSync(path.join(repo, "README.md"), "# publish\n", "utf8");
    spawnSync("git", ["add", "README.md"], { cwd: repo, encoding: "utf8" });

    const prepare = await app.inject({
      method: "POST",
      url: "/chat/workflow-action",
      payload: {
        action: "prepare_commit",
        repoPath: repo,
        includeUnstaged: false,
        commitMode: "commit-push",
        message: "docs: publish readme",
      },
    });
    expect(prepare.statusCode, prepare.body).toBe(200);
    const prepared = prepare.json() as {
      sessionId: string;
      workflowState: {
        workflowKind?: string;
        workflowPhase?: string;
        pendingApproval?: { action: { tool: string; args?: Record<string, unknown> } };
      };
    };
    expect(prepared.workflowState.workflowKind).toBe("commit");
    expect(prepared.workflowState.workflowPhase).toBe("waiting_for_commit_approval");
    expect(prepared.workflowState.pendingApproval?.action.tool).toBe("git_commit");

    const confirmed = await app.inject({
      method: "POST",
      url: `/chat/${prepared.sessionId}/confirm-action`,
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    const events = parseSse(confirmed.body);
    const approval = events.find((entry) => entry.event === "approval_required")?.data as
      | {
          approval?: {
            action?: {
              tool?: string;
              args?: Record<string, unknown>;
              readiness?: { status?: string; summary?: string };
              description?: string;
            };
          };
        }
      | undefined;
    const workflowEvent = events.findLast((entry) => entry.event === "workflow_state")?.data as
      | { state?: { workflowKind?: string; workflowPhase?: string } }
      | undefined;
    expect(workflowEvent?.state?.workflowKind).toBe("commit");
    expect(workflowEvent?.state?.workflowPhase).toBe("waiting_for_push_approval");
    expect(approval?.approval?.action?.tool).toBe("git_push");
    expect(approval?.approval?.action?.args).toEqual({
      branch: "feature/publish",
      setUpstream: true,
    });
    expect(approval?.approval?.action?.readiness?.status).toBe("no_upstream");
    expect(approval?.approval?.action?.description).toContain("No upstream branch is configured");
  });

  it("streams OpenHarness-style UI chunks alongside legacy chat SSE events", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-ui-stream-"));
    fs.writeFileSync(path.join(repo, "README.md"), "# demo\n", "utf8");

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "summarize current workspace",
        repoPath: repo,
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    const uiChunks = events
      .filter((entry) => entry.event === "ui.chunk")
      .map((entry) => entry.data as { chunk?: { type?: string; delta?: string } })
      .map((entry) => entry.chunk);

    expect(events.some((entry) => entry.event === "session")).toBe(true);
    expect(events.some((entry) => entry.event === "final")).toBe(true);
    expect(uiChunks.map((chunk) => chunk?.type)).toEqual(
      expect.arrayContaining([
        "start",
        "progress",
        "text-start",
        "text-delta",
        "text-end",
        "finish",
      ]),
    );
    expect(
      uiChunks.some(
        (chunk) =>
          chunk?.type === "text-delta" && typeof chunk.delta === "string" && chunk.delta.length > 0,
      ),
    ).toBe(true);
  });

  it("accepts image-only chat requests without storing raw image data", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-image-only-"));

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "",
        repoPath: repo,
        imageAttachments: [
          {
            name: "screen.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,aGVsbG8=",
          },
        ],
      },
    });

    expect(response.statusCode, response.body).toBe(200);
    const events = parseSse(response.body);
    const sessionId = (events.find((entry) => entry.event === "session")?.data as { sessionId?: string } | undefined)
      ?.sessionId;
    expect(sessionId).toBeTruthy();
    expect(events.some((entry) => entry.event === "final")).toBe(true);

    const session = await loadSession(sessionId!);
    const storedContent = [
      ...(session?.messages.map((message) => message.content) ?? []),
      ...(session?.bubbles.map((bubble) => bubble.content) ?? []),
    ].join("\n");
    expect(storedContent).toContain("[image: screen.png]");
    expect(storedContent).not.toContain("aGVsbG8=");
    expect(storedContent).not.toContain("data:image/png");
  });

  it("rejects chat image attachments when the MIME type does not match the data URL", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-image-mime-"));

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "",
        repoPath: repo,
        imageAttachments: [
          {
            name: "screen.png",
            mimeType: "image/jpeg",
            dataUrl: "data:image/png;base64,aGVsbG8=",
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("MIME type must match data URL");
  });

  it("rejects chat image attachments larger than 4 MB", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-image-large-"));
    const tooLargeBase64 = "a".repeat(Math.ceil(((4 * 1024 * 1024) + 1) / 3) * 4);

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "",
        repoPath: repo,
        imageAttachments: [
          {
            name: "large.png",
            mimeType: "image/png",
            dataUrl: `data:image/png;base64,${tooLargeBase64}`,
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("4 MB or smaller");
  });

  it("rejects chat requests with more than three image attachments", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-chat-image-count-"));

    const response = await app.inject({
      method: "POST",
      url: "/chat",
      payload: {
        message: "compare these",
        repoPath: repo,
        imageAttachments: Array.from({ length: 4 }, (_, index) => ({
          name: `screen-${index + 1}.png`,
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        })),
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).toContain("at most 3");
  });

});

function parseSse(body: string): Array<{ event: string; data: unknown }> {
  return body
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const event = block.match(/^event: (.+)$/m)?.[1] ?? "";
      const dataText = block.match(/^data: (.+)$/m)?.[1] ?? "null";
      return { event, data: JSON.parse(dataText) as unknown };
    });
}
