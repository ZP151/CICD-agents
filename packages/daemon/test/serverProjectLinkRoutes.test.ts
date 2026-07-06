import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AzureTableProjectLinkStore,
  createProjectLink,
  KeyVaultSecrets,
  resetSettingsForTests,
} from "@mergepilot/core";
import { buildApp } from "../src/server.js";

let app: Awaited<ReturnType<typeof buildApp>> | null = null;
let tmpDataDir = "";

beforeAll(() => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-daemon-project-link-"));
  tmpDataDir = tmp;
  process.env.RUNTIME_DATA_DIR = tmp;
  process.env.RUNTIME_HOST = "127.0.0.1";
  process.env.RUNTIME_PORT = "0";
  process.env.AZURE_OPENAI_ENDPOINT = "";
  process.env.AZURE_OPENAI_API_KEY = "";
  process.env.AZURE_COSMOS_ENDPOINT = "";
  process.env.AZURE_STORAGE_ACCOUNT = "";
  process.env.AZURE_KEYVAULT_URL = "";
  process.env.MERGEPILOT_SECRET_SOURCE = "";
  resetSettingsForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  process.env.AZURE_STORAGE_ACCOUNT = "";
  process.env.AZURE_KEYVAULT_URL = "";
  process.env.MERGEPILOT_SECRET_SOURCE = "";
  resetSettingsForTests();
  if (app) {
    await app.close();
    app = null;
  }
});

describe("daemon Project Link routes", () => {
  it("exposes Project Link CRUD on /project-links while preserving /project-links compatibility", async () => {
    app = await buildApp();

    const created = await app.inject({
      method: "POST",
      url: "/project-links",
      payload: {
        name: "Official Project Link",
        repoPath: process.cwd(),
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "mergepilot",
        adoPipelineId: "12",
        adoPipelineName: "MergePilot CI",
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      id: string;
      name: string;
      adoRepoName: string;
      adoPipelineId: string;
      adoPipelineName: string;
    };
    expect(body).toMatchObject({
      name: "Official Project Link",
      adoRepoName: "mergepilot",
      adoPipelineId: "12",
      adoPipelineName: "MergePilot CI",
    });

    const listed = await app.inject({ method: "GET", url: "/project-links" });
    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: body.id })]));

    const legacyRead = await app.inject({ method: "GET", url: `/project-links/${body.id}` });
    expect(legacyRead.statusCode).toBe(200);
    expect(legacyRead.json()).toMatchObject({ id: body.id, name: "Official Project Link" });

    const updated = await app.inject({
      method: "PUT",
      url: `/project-links/${body.id}`,
      payload: {
        adoRepoName: "mergepilot-renamed",
        adoPipelineId: "34",
        adoPipelineName: "MergePilot Release",
      },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id: body.id,
      adoRepoName: "mergepilot-renamed",
      adoPipelineId: "34",
      adoPipelineName: "MergePilot Release",
    });

    const deleted = await app.inject({ method: "DELETE", url: `/project-links/${body.id}` });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ ok: true });
  });

  it("falls back to local Project Links when Azure Table authentication is unavailable", async () => {
    const local = createProjectLink(tmpDataDir, {
      name: "Local Project Link",
      repoPath: process.cwd(),
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName: "mergepilot",
      adoPat: "",
      adoPipelineId: "",
      adoPipelineName: "",
      adoMcpEnabled: false,
      adoMcpCommand: "",
      adoMcpAuthentication: "",
      adoMcpDomains: "repositories,pipelines,work-items",
      projectTemplate: "",
      buildCommand: "",
      testCommand: "",
    });
    process.env.AZURE_STORAGE_ACCOUNT = "demoaccount";
    resetSettingsForTests();
    vi.spyOn(AzureTableProjectLinkStore.prototype, "list").mockRejectedValue(
      new Error("Automatic authentication has been disabled. You may call the authentication() method."),
    );

    app = await buildApp();
    const listed = await app.inject({ method: "GET", url: "/project-links" });

    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: local.id })]));
  });

  it("falls back to local Project Links when Azure Table consent is missing", async () => {
    const local = createProjectLink(tmpDataDir, {
      name: "Local Consent Fallback Link",
      repoPath: process.cwd(),
      defaultBranch: "main",
      targetBranch: "main",
      adoOrgUrl: "https://dev.azure.com/demo-org",
      adoProject: "Agents",
      adoRepoName: "mergepilot",
      adoPat: "",
      adoPipelineId: "",
      adoPipelineName: "",
      adoMcpEnabled: false,
      adoMcpCommand: "",
      adoMcpAuthentication: "",
      adoMcpDomains: "repositories,pipelines,work-items",
      projectTemplate: "",
      buildCommand: "",
      testCommand: "",
    });
    process.env.AZURE_STORAGE_ACCOUNT = "demoaccount";
    resetSettingsForTests();
    vi.spyOn(AzureTableProjectLinkStore.prototype, "list").mockRejectedValue(
      new Error(
        "invalid_grant: AADSTS65001: The user or administrator has not consented to use the application named 'DevCICDAgent'.",
      ),
    );

    app = await buildApp();
    const listed = await app.inject({ method: "GET", url: "/project-links" });

    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: local.id })]));
  });

  it("does not require Key Vault PAT lookup when local env secrets are selected", async () => {
    process.env.AZURE_STORAGE_ACCOUNT = "demoaccount";
    process.env.AZURE_KEYVAULT_URL = "https://devagentkv001.vault.azure.net/";
    process.env.MERGEPILOT_SECRET_SOURCE = "local_env";
    resetSettingsForTests();
    vi.spyOn(AzureTableProjectLinkStore.prototype, "list").mockResolvedValue([
      {
        id: "cloud-link",
        name: "Cloud Project Link",
        createdAt: 1,
        updatedAt: 2,
        repoPath: process.cwd(),
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/demo-org",
        adoProject: "Agents",
        adoRepoName: "mergepilot",
        adoPat: "",
        adoPipelineId: "",
        adoPipelineName: "",
        adoMcpEnabled: false,
        adoMcpCommand: "",
        adoMcpAuthentication: "",
        adoMcpDomains: "repositories,pipelines,work-items",
        projectTemplate: "",
        buildCommand: "",
        testCommand: "",
      },
    ]);
    const getPat = vi.spyOn(KeyVaultSecrets.prototype, "getAdoPat").mockRejectedValue(
      new Error("Key Vault should not be called in local_env mode"),
    );

    app = await buildApp();
    const listed = await app.inject({ method: "GET", url: "/project-links" });

    expect(listed.statusCode, listed.body).toBe(200);
    expect(listed.json()).toEqual([
      expect.objectContaining({ id: "cloud-link", name: "Cloud Project Link" }),
    ]);
    expect(getPat).not.toHaveBeenCalled();
  });

  it("discovers Project Link Azure DevOps options through internal ADO logic", async () => {
    app = await buildApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          value: [
            {
              id: "project-1",
              name: "DemoProject",
              description: "Demo project",
              url: "https://dev.azure.com/demo-org/DemoProject",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const r = await app.inject({
      method: "POST",
      url: "/project-links/discover",
      payload: {
        kind: "projects",
        projectLink: {
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoPat: "test-pat",
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      source: "internal",
      kind: "projects",
      items: [
        {
          id: "project-1",
          name: "DemoProject",
          description: "Demo project",
          url: "https://dev.azure.com/demo-org/DemoProject",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/_apis/projects?%24top=100&api-version=7.1-preview.4",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("discovers Project Link pipelines by resolving the repository name internally", async () => {
    app = await buildApp();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/_apis/git/repositories?")) {
        return new Response(
          JSON.stringify({
            value: [
              {
                id: "repo-1",
                name: "mergepilot",
                defaultBranch: "refs/heads/main",
                webUrl: "https://dev.azure.com/demo-org/Agents/_git/mergepilot",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/_apis/build/definitions?")) {
        expect(url).toContain("repositoryId=repo-1");
        return new Response(
          JSON.stringify({
            value: [
              {
                id: 12,
                name: "MergePilot CI",
                path: "\\",
                repository: { id: "repo-1", name: "mergepilot", type: "TfsGit" },
                process: { yamlFilename: "azure-pipelines.yml" },
                _links: {
                  web: { href: "https://dev.azure.com/demo-org/Agents/_build?definitionId=12" },
                },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: `unexpected URL ${url}` }), { status: 404 });
    });

    const r = await app.inject({
      method: "POST",
      url: "/project-links/discover",
      payload: {
        kind: "pipelines",
        projectLink: {
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoProject: "Agents",
          adoRepoName: "mergepilot",
          adoPat: "test-pat",
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      source: "internal",
      kind: "pipelines",
      items: [
        {
          id: "12",
          name: "MergePilot CI",
          description: "\\ · repo:mergepilot · type:TfsGit · yaml:azure-pipelines.yml",
          url: "https://dev.azure.com/demo-org/Agents/_build?definitionId=12",
        },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("checks internal Project Link Azure DevOps tool availability", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ value: [{ id: "project-1", name: "DemoProject" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const r = await app.inject({
      method: "POST",
      url: "/project-links/check-ado-tools",
      payload: {
        projectLink: {
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoPat: "test-pat",
        },
      },
    });

    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({
      ok: true,
      source: "internal",
      authMode: "pat",
      projectCount: 1,
    });
    expect(
      (r.json() as { tools: Array<{ name: string }> }).tools.map((tool) => tool.name),
    ).toContain("ado_core_list_projects");
  });

  it("returns structured ADO auth diagnostics when tool health fails", async () => {
    app = await buildApp();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ message: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    const r = await app.inject({
      method: "POST",
      url: "/project-links/check-ado-tools",
      payload: {
        projectLink: {
          adoOrgUrl: "https://dev.azure.com/demo-org",
          adoPat: "bad-pat",
        },
      },
    });

    expect(r.statusCode).toBe(400);
    expect(r.json()).toMatchObject({
      ok: false,
      source: "internal",
      authMode: "pat",
      authStatus: "pat_invalid_or_missing_scope",
      retryable: false,
    });
  });
});
