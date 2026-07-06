import { afterEach, describe, expect, it, vi } from "vitest";
import { azureDevOpsTools } from "../src/ado/toolRegistry.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Azure DevOps pull request mutation registry tools", () => {
  it("maps update PR title and description payloads to the typed ADO update endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        pullRequestId: 42,
        title: "Ready for review",
        description: "Updated summary",
        status: "active",
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    const result = await runTool("ado_update_pull_request", {
      pull_request_id: 42,
      title: "Ready for review",
      description: "Updated summary",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullrequests/42?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "Ready for review", description: "Updated summary" }),
      }),
    );
    expect(result).toMatchObject({
      id: 42,
      title: "Ready for review",
      description: "Updated summary",
      status: "active",
    });
  });

  it("maps reviewer and label mutation payloads to typed ADO endpoints", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "reviewer-1",
        displayName: "Ada Lovelace",
        uniqueName: "ada@example.com",
        vote: 10,
        isRequired: true,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "label-1",
        name: "ready-for-review",
        active: true,
      }), { status: 200, headers: { "content-type": "application/json" } }));

    const reviewer = await runTool("ado_add_pull_request_reviewer", {
      pull_request_id: 42,
      reviewer_id: "ada@example.com",
      vote: 10,
      is_required: true,
    });
    const label = await runTool("ado_add_pull_request_label", {
      pull_request_id: 42,
      label: "ready-for-review",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullRequests/42/reviewers/ada%40example.com?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ vote: 10, isRequired: true }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://dev.azure.com/demo-org/Agents/_apis/git/repositories/mergepilot/pullRequests/42/labels?api-version=7.1-preview.1",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "ready-for-review" }),
      }),
    );
    expect(reviewer).toMatchObject({ reviewerId: "reviewer-1", action: "added" });
    expect(label).toMatchObject({ id: "label-1", name: "ready-for-review", action: "added" });
  });

  it("maps work item linking payloads to the typed ArtifactLink endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: [{ id: "project-guid", name: "Agents" }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: [{ id: "repo-guid", name: "mergepilot" }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await runTool("ado_link_work_item", {
      pull_request_id: 42,
      work_item_id: 123,
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
    expect(result).toEqual({ ok: true, work_item_id: 123, pull_request_id: 42 });
  });
});

async function runTool(name: string, payload: Record<string, unknown>): Promise<unknown> {
  const tool = azureDevOpsTools().find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Tool ${name} was not found.`);
  return await tool.handler({
    repoPath: process.cwd(),
    env: {},
    timeoutSec: 30,
    extra: { ado_pat: "pat" },
  }, {
    organization: "demo-org",
    project: "Agents",
    repository: "mergepilot",
    ...payload,
  });
}
