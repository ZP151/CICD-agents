import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resetSettingsForTests, type TaskHandle } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-task-routes-"));
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

describe("daemon basic and task routes", () => {
  it("responds to /healthz with runtime ownership metadata", async () => {
    const previousRuntimeMode = process.env.MERGEPILOT_RUNTIME_MODE;
    const previousDesktopVersion = process.env.MERGEPILOT_DESKTOP_VERSION;
    const previousDaemonVersion = process.env.MERGEPILOT_DAEMON_VERSION;
    const previousBuildSha = process.env.MERGEPILOT_BUILD_SHA;
    process.env.MERGEPILOT_RUNTIME_MODE = "desktop-sidecar";
    process.env.MERGEPILOT_DESKTOP_VERSION = "0.5.23-test";
    process.env.MERGEPILOT_DAEMON_VERSION = "0.5.23-test";
    process.env.MERGEPILOT_BUILD_SHA = "abc123-runtime";
    try {
      app = await buildApp();
      const r = await app.inject({ method: "GET", url: "/healthz" });
      expect(r.statusCode).toBe(200);
      const body = r.json() as {
        ok: boolean;
        version: string;
        runtimeMode: string;
        desktopVersion: string;
        buildSha: string;
        pid: number;
        execPath: string;
      };
      expect(body.ok).toBe(true);
      expect(body.version).toBe("0.5.23-test");
      expect(body.runtimeMode).toBe("desktop-sidecar");
      expect(body.desktopVersion).toBe("0.5.23-test");
      expect(body.buildSha).toBe("abc123-runtime");
      expect(body.pid).toBe(process.pid);
      expect(body.execPath).toBe(process.execPath);
    } finally {
      if (previousRuntimeMode === undefined) delete process.env.MERGEPILOT_RUNTIME_MODE;
      else process.env.MERGEPILOT_RUNTIME_MODE = previousRuntimeMode;
      if (previousDesktopVersion === undefined) delete process.env.MERGEPILOT_DESKTOP_VERSION;
      else process.env.MERGEPILOT_DESKTOP_VERSION = previousDesktopVersion;
      if (previousDaemonVersion === undefined) delete process.env.MERGEPILOT_DAEMON_VERSION;
      else process.env.MERGEPILOT_DAEMON_VERSION = previousDaemonVersion;
      if (previousBuildSha === undefined) delete process.env.MERGEPILOT_BUILD_SHA;
      else process.env.MERGEPILOT_BUILD_SHA = previousBuildSha;
    }
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

    for (let i = 0; i < 20; i++) {
      const view = await app.inject({ method: "GET", url: `/tasks/${taskId}` });
      const body = view.json() as { status: string };
      if (body.status === "succeeded" || body.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
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
