import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getSettings, resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-chat-history-"));
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

describe("daemon chat history routes", () => {
  it("lists pinned chat history before regular sessions", async () => {
    app = await buildApp();
    const storePath = path.join(getSettings().dataDir, "chat-history.json");
    const now = Math.floor(Date.now() / 1000);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          regular: {
            id: "regular",
            createdAt: now + 10,
            updatedAt: now + 10,
            repoPath: process.cwd(),
            messages: [{ role: "user", content: "regular chat", timestamp: now + 10 }],
            bubbles: [],
          },
          pinned: {
            id: "pinned",
            createdAt: now,
            updatedAt: now,
            title: "Pinned planning chat",
            pinned: true,
            repoPath: process.cwd(),
            messages: [{ role: "user", content: "pinned chat", timestamp: now }],
            bubbles: [],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const response = await app.inject({ method: "GET", url: "/chat/history" });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json() as Array<{ sessionId: string; title?: string; pinned?: boolean }>;
    expect(body.slice(0, 2)).toMatchObject([
      { sessionId: "pinned", title: "Pinned planning chat", pinned: true },
      { sessionId: "regular", pinned: false },
    ]);
  });

  it("updates chat session metadata", async () => {
    app = await buildApp();
    const storePath = path.join(getSettings().dataDir, "chat-history.json");
    const now = Math.floor(Date.now() / 1000);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          "chat-meta": {
            id: "chat-meta",
            createdAt: now,
            updatedAt: now,
            repoPath: process.cwd(),
            messages: [{ role: "user", content: "rename me", timestamp: now }],
            bubbles: [],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const response = await app.inject({
      method: "PATCH",
      url: "/chat/chat-meta/metadata",
      payload: { title: "Release checklist", pinned: true },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({
      sessionId: "chat-meta",
      title: "Release checklist",
      pinned: true,
    });
  });

  it("deletes a chat session", async () => {
    app = await buildApp();
    const storePath = path.join(getSettings().dataDir, "chat-history.json");
    const now = Math.floor(Date.now() / 1000);
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.writeFileSync(
      storePath,
      JSON.stringify(
        {
          "chat-delete": {
            id: "chat-delete",
            createdAt: now,
            updatedAt: now,
            repoPath: process.cwd(),
            messages: [{ role: "user", content: "delete me", timestamp: now }],
            bubbles: [],
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const response = await app.inject({ method: "DELETE", url: "/chat/chat-delete" });
    const history = await app.inject({ method: "GET", url: "/chat/history" });

    expect(response.statusCode, response.body).toBe(200);
    expect(history.json() as Array<{ sessionId: string }>).not.toContainEqual(
      expect.objectContaining({ sessionId: "chat-delete" }),
    );
  });
});
