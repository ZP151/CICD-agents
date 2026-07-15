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

  it("does not surface unknown as a synthetic missing run date", () => {
    expect(formatDate(undefined)).toBe("");
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
