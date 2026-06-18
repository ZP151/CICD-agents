import { describe, expect, it, vi } from "vitest";
import {
  getAzureBuildLogExcerpt,
  getAzurePipelineRun,
  listAzureBuildDefinitions,
  listAzureBuilds,
} from "../src/tools/azureDevOps.js";
import { jsonResponse, mockJson } from "./adoTestDoubles.js";

describe("internal Azure DevOps build and pipeline ports", () => {
  it("lists builds with branch normalization and trimmed build data", async () => {
    const fetchMock = mockJson({
      value: [
        {
          id: 77,
          buildNumber: "20260610.1",
          status: "completed",
          result: "succeeded",
          queueTime: "2026-06-10T10:00:00Z",
          startTime: "2026-06-10T10:01:00Z",
          finishTime: "2026-06-10T10:05:00Z",
          sourceBranch: "refs/heads/main",
          sourceVersion: "abcdef",
          definition: { name: "CI" },
          repository: { name: "mergepilot" },
          requestedFor: { displayName: "Ada" },
          _links: { web: { href: "https://ado/build/77" } },
        },
      ],
    });

    const builds = await listAzureBuilds({
      organization: "demo-org",
      project: "Agents",
      pat: "pat",
      definitions: [12],
      branchName: "main",
      top: 5,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/build/builds?queryOrder=queueTimeDescending&%24top=5&api-version=7.1-preview.7&definitions=12&branchName=refs%2Fheads%2Fmain",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(builds).toEqual([
      {
        id: 77,
        buildNumber: "20260610.1",
        status: "completed",
        result: "succeeded",
        queueTime: "2026-06-10T10:00:00Z",
        startTime: "2026-06-10T10:01:00Z",
        finishTime: "2026-06-10T10:05:00Z",
        sourceBranch: "main",
        sourceVersion: "abcdef",
        definitionName: "CI",
        repository: "mergepilot",
        requestedFor: "Ada",
        url: "https://ado/build/77",
      },
    ]);
  });

  it("includes repository and yaml metadata in build definition discovery", async () => {
    mockJson({
      value: [{
        id: 12,
        name: "web-app CI",
        path: "\\",
        repository: { name: "web-app", type: "TfsGit" },
        process: { yamlFilename: "azure-pipelines.yml" },
        _links: { web: { href: "https://ado/definition/12" } },
      }],
    });

    const definitions = await listAzureBuildDefinitions({
      organization: "demo-org",
      project: "Agents",
      pat: "pat",
    });

    expect(definitions).toEqual([{
      id: "12",
      name: "web-app CI",
      description: "\\ · repo:web-app · type:TfsGit · yaml:azure-pipelines.yml",
      url: "https://ado/definition/12",
    }]);
  });

  it("sends repository type when build definition discovery is filtered by repository", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        value: [{ id: "repo-1", name: "web-app", defaultBranch: "refs/heads/main" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        value: [{
          id: 12,
          name: "web-app CI",
          repository: { name: "web-app", type: "TfsGit" },
        }],
      }));

    await listAzureBuildDefinitions({
      organization: "demo-org",
      project: "Agents",
      repositoryId: "web-app",
      pat: "pat",
    });

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("repositoryId=repo-1");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("repositoryType=TfsGit");
  });

  it("gets a pipeline run by ID", async () => {
    mockJson({
      id: 88,
      name: "Run 88",
      state: "completed",
      result: "succeeded",
      createdDate: "2026-06-10T10:00:00Z",
      finishedDate: "2026-06-10T10:05:00Z",
      resources: { repositories: { self: { refName: "refs/heads/main" } } },
      _links: { web: { href: "https://ado/run/88" } },
    });

    const run = await getAzurePipelineRun({
      organization: "demo-org",
      project: "Agents",
      pipelineId: 12,
      runId: 88,
      pat: "pat",
    });

    expect(run).toMatchObject({
      id: 88,
      name: "Run 88",
      sourceBranch: "main",
      url: "https://ado/run/88",
    });
  });

  it("gets a diagnostic build log excerpt around failure lines", async () => {
    const lines = Array.from({ length: 120 }, (_, index) => `noise line ${index + 1}`);
    lines[70] = "##[error]AssertionError: expected true to be false";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(lines.join("\n"), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    const excerpt = await getAzureBuildLogExcerpt({
      organization: "demo-org",
      project: "Agents",
      buildId: 77,
      logId: 9,
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/build/builds/77/logs/9?api-version=7.1-preview.7",
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({ Accept: "text/plain" }),
      }),
    );
    expect(excerpt).toMatchObject({
      buildId: 77,
      logId: 9,
      lineCount: 120,
      truncated: true,
    });
    expect(excerpt.startLine).toBeGreaterThan(1);
    expect(excerpt.excerpt).toContain("AssertionError: expected true to be false");
    expect(excerpt.excerpt.split("\n")).not.toContain("noise line 1");
  });
});
