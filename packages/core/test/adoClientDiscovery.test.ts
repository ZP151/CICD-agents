import { describe, expect, it, vi } from "vitest";
import { listAzureBuildDefinitions } from "../src/ado/builds.js";
import { listAzureProjects } from "../src/ado/core.js";
import { listAzurePipelineRuns, triggerAzurePipelineRun } from "../src/ado/pipelines.js";
import { listAzureRepositories } from "../src/ado/repositories.js";
import { parseAdoJson } from "../src/ado/response.js";
import { linkAzureWorkItemToPullRequest } from "../src/ado/workItems.js";
import { jsonResponse } from "./adoTestDoubles.js";

describe("Azure DevOps discovery modules", () => {
  it("lists projects through the ADO core module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        value: [
          { id: "p1", name: "Agents", description: "Automation", url: "https://ado/project" },
        ],
      }),
    );

    const projects = await listAzureProjects({
      organization: "https://tebssg.visualstudio.com/",
      pat: "pat",
      top: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://tebssg.visualstudio.com/_apis/projects?%24top=1&api-version=7.1-preview.4",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(projects).toEqual([
      { id: "p1", name: "Agents", description: "Automation", url: "https://ado/project" },
    ]);
  });

  it("lists repositories through the ADO repositories module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        value: [
          {
            id: "r1",
            name: "mergepilot",
            defaultBranch: "refs/heads/main",
            webUrl: "https://ado/repo",
          },
          {
            id: "r2",
            name: "other",
            defaultBranch: "refs/heads/develop",
          },
        ],
      }),
    );

    const repositories = await listAzureRepositories({
      organization: "demo-org",
      project: "Agents",
      pat: "pat",
      top: 1,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories?api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(repositories).toEqual([
      { id: "r1", name: "mergepilot", description: "main", url: "https://ado/repo" },
    ]);
  });

  it("rejects HTML ADO responses as auth/configuration failures", async () => {
    await expect(
      parseAdoJson(new Response("<html>sign in</html>", { status: 200 }), "list projects"),
    ).rejects.toThrow(/returned HTML instead of JSON/);
  });

  it("lists build definitions through the ADO builds module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        value: [{ id: "repo-guid", name: "mergepilot", defaultBranch: "refs/heads/main" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        value: [{
          id: 77,
          name: "CI",
          path: "\\",
          repository: { name: "mergepilot", type: "TfsGit" },
          process: { yamlFilename: "azure-pipelines.yml" },
          _links: { web: { href: "https://ado/build/77" } },
        }],
      }));

    const definitions = await listAzureBuildDefinitions({
      organization: "demo-org",
      project: "Agents",
      repositoryId: "mergepilot",
      pat: "pat",
      top: 10,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories?api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/build/definitions?%24top=10&api-version=7.1-preview.7&repositoryId=repo-guid&repositoryType=TfsGit",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(definitions).toEqual([{
      id: "77",
      name: "CI",
      description: "\\ · repo:mergepilot · type:TfsGit · yaml:azure-pipelines.yml",
      url: "https://ado/build/77",
    }]);
  });

  it("lists pipeline runs through the ADO pipelines module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        value: [{
          id: 123,
          name: "20260618.1",
          state: "completed",
          result: "succeeded",
          createdDate: "2026-06-18T01:00:00Z",
          finishedDate: "2026-06-18T01:05:00Z",
          resources: { repositories: { self: { refName: "refs/heads/main" } } },
          _links: { web: { href: "https://ado/run/123" } },
        }],
      }),
    );

    const runs = await listAzurePipelineRuns({
      organization: "demo-org",
      project: "Agents",
      pipelineId: 77,
      pat: "pat",
      top: 5,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/pipelines/77/runs?api-version=7.1&%24top=5",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(runs).toEqual([{
      id: 123,
      name: "20260618.1",
      state: "completed",
      result: "succeeded",
      createdDate: "2026-06-18T01:00:00Z",
      finishedDate: "2026-06-18T01:05:00Z",
      sourceBranch: "main",
      url: "https://ado/run/123",
    }]);
  });

  it("triggers pipeline runs through the ADO pipelines module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        id: 456,
        state: "inProgress",
        name: "20260618.2",
        _links: { web: { href: "https://ado/run/456" } },
      }),
    );

    const run = await triggerAzurePipelineRun({
      organization: "demo-org",
      project: "Agents",
      pipelineId: 77,
      branch: "feature/tool-registry",
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/pipelines/77/runs?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          resources: { repositories: { self: { refName: "refs/heads/feature/tool-registry" } } },
        }),
      }),
    );
    expect(run).toEqual({
      run_id: 456,
      state: "inProgress",
      name: "20260618.2",
      url: "https://ado/run/456",
    });
  });

  it("links work items to pull requests through the ADO work-items module", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({
        value: [{ id: "project-guid", name: "Agents" }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        value: [{ id: "repo-guid", name: "mergepilot" }],
      }))
      .mockResolvedValueOnce(jsonResponse({}));

    const link = await linkAzureWorkItemToPullRequest({
      organization: "demo-org",
      project: "Agents",
      repository: "mergepilot",
      pullRequestId: 42,
      workItemId: 123,
      pat: "pat",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/_apis/projects?%24top=200&api-version=7.1-preview.4",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories?api-version=7.1-preview.1",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://dev.azure.com/demo-org/Agents/_apis/wit/workitems/123?api-version=7.1-preview.3",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify([{
          op: "add",
          path: "/relations/-",
          value: {
            rel: "ArtifactLink",
            url: "vstfs:///Git/PullRequestId/project-guid%2Frepo-guid%2F42",
            attributes: { name: "Pull Request" },
          },
        }]),
      }),
    );
    expect(link).toEqual({ ok: true, work_item_id: 123, pull_request_id: 42 });
  });
});
