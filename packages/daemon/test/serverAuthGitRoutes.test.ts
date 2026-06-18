import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { resetSettingsForTests } from "@mergepilot/core";
import { buildApp } from "../src/server.js";

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

describe("daemon auth and git utility routes", () => {
  it("infers Azure DevOps Project Link fields from a git remote", async () => {
    app = await buildApp();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-ado-remote-"));
    const git = (args: string[]) => {
      const result = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
    };
    git(["init"]);
    git([
      "remote",
      "add",
      "origin",
      "https://dev.azure.com/demo-org/Demo%20Project/_git/mergepilot",
    ]);

    const r = await app.inject({
      method: "GET",
      url: `/git/azure-devops-remote?repoPath=${encodeURIComponent(repo)}`,
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      suggestion: {
        remoteName: "origin",
        remoteUrl: "https://dev.azure.com/demo-org/Demo%20Project/_git/mergepilot",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Demo Project",
        adoRepoName: "mergepilot",
      },
    });
  });

  it("reports cached auth status and clears local auth cache without Azure CLI", async () => {
    app = await buildApp();

    const status = await app.inject({ method: "GET", url: "/auth/status" });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ authenticated: false, fromCache: true });

    const logout = await app.inject({ method: "POST", url: "/auth/logout" });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ ok: true });
  });
});
