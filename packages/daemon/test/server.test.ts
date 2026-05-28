import { describe, expect, it, afterEach, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests, type TaskHandle } from "@cicd-agent/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-daemon-"));
  process.env.RUNTIME_DATA_DIR = tmp;
  process.env.RUNTIME_HOST = "127.0.0.1";
  process.env.RUNTIME_PORT = "0";
  process.env.AZURE_OPENAI_ENDPOINT = "";
  process.env.AZURE_OPENAI_API_KEY = "";
  resetSettingsForTests();
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

describe("daemon HTTP", () => {
  it("responds to /healthz", async () => {
    app = await buildApp();
    const r = await app.inject({ method: "GET", url: "/healthz" });
    expect(r.statusCode).toBe(200);
    const body = r.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("submits and observes a task", async () => {
    app = await buildApp({
      runner: async (h: TaskHandle) => {
        h.step("hi", "ok", "hello");
        return { ok: true };
      },
    });
    const submit = await app.inject({
      method: "POST",
      url: "/tasks/submit-pipeline",
      payload: { repoPath: process.cwd() },
    });
    expect(submit.statusCode).toBe(202);
    const { taskId } = submit.json() as { taskId: string };
    // Wait briefly for the worker.
    for (let i = 0; i < 20; i++) {
      const view = await app.inject({ method: "GET", url: `/tasks/${taskId}` });
      const body = view.json() as { status: string };
      if (body.status === "succeeded" || body.status === "failed") break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const final = await app.inject({ method: "GET", url: `/tasks/${taskId}` });
    expect(final.statusCode).toBe(200);
    const body = final.json() as { status: string; steps: unknown[] };
    expect(body.status).toBe("succeeded");
    expect(body.steps.length).toBeGreaterThan(0);
  });

  it("rejects malformed submit-pipeline payloads", async () => {
    app = await buildApp();
    const r = await app.inject({
      method: "POST",
      url: "/tasks/submit-pipeline",
      payload: {},
    });
    expect(r.statusCode).toBe(400);
  });

  it("returns 404 for unknown task", async () => {
    app = await buildApp();
    const r = await app.inject({ method: "GET", url: "/tasks/no-such-task" });
    expect(r.statusCode).toBe(404);
  });

  it("returns empty chat workflow state for an unknown session", async () => {
    app = await buildApp();
    const state = await app.inject({ method: "GET", url: "/chat/no-such-session/state" });
    expect(state.statusCode).toBe(200);
    const body = state.json() as { workflowState?: unknown };
    expect(body.workflowState).toBeUndefined();
  });
});
