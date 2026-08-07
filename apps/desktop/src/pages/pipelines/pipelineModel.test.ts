import { describe, expect, it } from "vitest";
import type {
  AdoDiscoveryOption,
  PipelineConnection,
  PullRequestSummary,
  ProjectLink,
} from "../../api";
import {
  buildPipelineRows,
  countPipelineRows,
  formatDate,
  pipelineProjectLinksCacheKey,
  rowMatchesFilter,
} from "./pipelineModel";

const projectLinks = [
  {
    id: "pl-1",
    name: "ClaimBot link",
    repoPath: "C:\\work\\TeBS-ClaimBot",
    adoOrgUrl: "https://tebssg.visualstudio.com/",
    adoProject: "TeBS-ClaimBot",
    adoRepoName: "TeBS-ClaimBot",
    defaultBranch: "developZP",
    targetBranch: "main",
  },
  {
    id: "pl-2",
    name: "Other link",
    repoPath: "C:\\work\\Other",
    adoOrgUrl: "https://tebssg.visualstudio.com/",
    adoProject: "Other",
    adoRepoName: "Other",
    defaultBranch: "main",
    targetBranch: "main",
  },
] as ProjectLink[];

function pullRequestWithPipelineRun(
  pipelineId: string,
  overrides: Partial<PullRequestSummary["pipelineRun"]> = {},
): PullRequestSummary {
  return {
    id: 2670,
    title: "Improve pipeline",
    status: "active",
    isDraft: false,
    sourceBranch: "feature/demo",
    targetBranch: "main",
    createdBy: "Zhou Ping",
    creationDate: "2026-07-01T00:00:00.000Z",
    repository: "TeBS-ClaimBot",
    url: "https://dev.azure.com/demo/pr/2670",
    reviewerCount: 1,
      reviewers: [],
    voteSummary: {
      approved: 1,
      waiting: 0,
      rejected: 0,
    },
    pipelineRun: {
      id: 4680,
      name: "20260701.1",
      state: "completed",
      result: "succeeded",
      createdDate: "2026-07-01T00:00:00.000Z",
      finishedDate: "2026-07-01T00:05:00.000Z",
      sourceBranch: "refs/heads/main",
      url: `https://dev.azure.com/demo/_build/results?buildId=4680&definitionId=${pipelineId}`,
      ...overrides,
    },
  };
}

describe("pipeline model", () => {
  it("builds saved pipeline connections separately from discovered pipelines", () => {
    const connections: PipelineConnection[] = [
      {
        id: "conn-1",
        projectLinkId: "pl-1",
        pipelineId: "108",
        pipelineName: "TeBS-ClaimBot",
        purpose: "ci",
        isDefault: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const discovered: Record<string, AdoDiscoveryOption[]> = {
      "pl-1": [
        { id: "108", name: "TeBS-ClaimBot", description: "", url: "" },
        { id: "111", name: "TeBS-ClaimBot (111)", description: "", url: "" },
      ],
    };

    const rows = buildPipelineRows(projectLinks, connections, discovered, {});

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => `${row.pipelineId}:${row.source}`)).toEqual([
      "108:saved",
      "111:discovered",
    ]);
    expect(countPipelineRows(rows)).toMatchObject({
      all: 2,
      saved: 1,
      discovered: 1,
    });
  });

  it("supports project-level filtering outside of Project Link pipeline configuration", () => {
    const discovered: Record<string, AdoDiscoveryOption[]> = {
      "pl-1": [{ id: "108", name: "TeBS-ClaimBot", description: "", url: "" }],
      "pl-2": [{ id: "200", name: "Other CI", description: "", url: "" }],
    };

    const rows = buildPipelineRows(
      projectLinks.filter((projectLink) => projectLink.adoProject === "TeBS-ClaimBot"),
      [],
      discovered,
      {},
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.project).toBe("TeBS-ClaimBot");
    expect(rowMatchesFilter(rows[0]!, "discovered")).toBe(true);
  });

  it("deduplicates the same discovered ADO pipeline across temporary Project Links", () => {
    const duplicateLinks: ProjectLink[] = [
      {
        ...projectLinks[0]!,
        id: "pl-live-1",
        name: "mp-live-claimbot-pipeline-20260715120108",
        adoRepoName: "ClaimBot_API",
      },
      {
        ...projectLinks[0]!,
        id: "pl-real",
        name: "ClaimBot_API link",
        adoRepoName: "ClaimBot_API",
      },
      {
        ...projectLinks[0]!,
        id: "pl-live-2",
        name: "mp-live-claimbot-discover-pipeline-20260716180959",
        adoRepoName: "ClaimBot_API",
      },
    ];
    const discovered: Record<string, AdoDiscoveryOption[]> = {
      "pl-live-1": [{ id: "117", name: "ClaimBot_API", description: "", url: "" }],
      "pl-real": [{ id: "117", name: "ClaimBot_API", description: "", url: "" }],
      "pl-live-2": [{ id: "117", name: "ClaimBot_API", description: "", url: "" }],
    };

    const rows = buildPipelineRows(duplicateLinks, [], discovered, {
      "pl-live-1": [pullRequestWithPipelineRun("117", { id: 4701 })],
      "pl-real": [pullRequestWithPipelineRun("117", { id: 4702 })],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectLinkId: "pl-real",
      projectLinkName: "ClaimBot_API link",
      pipelineId: "117",
      pipelineName: "ClaimBot_API",
      source: "discovered",
    });
    expect(rows[0]?.relatedPullRequests).toHaveLength(1);
    expect(countPipelineRows(rows)).toMatchObject({
      all: 1,
      discovered: 1,
    });
  });

  it("does not surface unknown as a synthetic missing run date", () => {
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("not-a-date")).toBe("");
  });

  it("keys pipeline cache by stable identity only (V2 canonical, GAP-01)", () => {
    const base = projectLinks[0]!;

    // Legacy fields never participate in the cache key.
    expect(pipelineProjectLinksCacheKey([base])).toBe(
      pipelineProjectLinksCacheKey([{ ...base, defaultBranch: "feature/other" }]),
    );
    expect(pipelineProjectLinksCacheKey([base])).toBe(
      pipelineProjectLinksCacheKey([{ ...base, adoPipelineId: "999", adoPipelineName: "Other" }]),
    );
    // Mapping identity changes still invalidate the cache.
    expect(pipelineProjectLinksCacheKey([base])).not.toBe(
      pipelineProjectLinksCacheKey([{ ...base, adoRepoName: "ClaimBot_API" }]),
    );
    expect(pipelineProjectLinksCacheKey([base, projectLinks[1]!])).toBe(
      pipelineProjectLinksCacheKey([projectLinks[1]!, base]),
    );
  });

  it("attaches latest PR run only when it matches the pipeline id", () => {
    const rows = buildPipelineRows(
      [projectLinks[0]!],
      [{
        id: "conn-1",
        projectLinkId: "pl-1",
        pipelineId: "108",
        pipelineName: "TeBS-ClaimBot",
        purpose: "ci",
        isDefault: true,
        createdAt: 1,
        updatedAt: 1,
      }],
      {},
      { "pl-1": [pullRequestWithPipelineRun("108")] },
    );

    expect(rows[0]?.latestRun).toMatchObject({
      id: 4680,
      result: "succeeded",
    });
  });

  it("does not attach unrelated PR runs to a pipeline card", () => {
    const rows = buildPipelineRows(
      [projectLinks[0]!],
      [{
        id: "conn-1",
        projectLinkId: "pl-1",
        pipelineId: "108",
        pipelineName: "TeBS-ClaimBot",
        purpose: "ci",
        isDefault: true,
        createdAt: 1,
        updatedAt: 1,
      }],
      {},
      { "pl-1": [pullRequestWithPipelineRun("999")] },
    );

    expect(rows[0]?.latestRun).toBeUndefined();
    expect(rowMatchesFilter(rows[0]!, "succeeded")).toBe(false);
  });
});
