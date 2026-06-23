import { describe, expect, it } from "vitest";
import type {
  AdoDiscoveryOption,
  PipelineConnection,
  ProjectLink,
} from "../../api";
import {
  buildPipelineRows,
  countPipelineRows,
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
});
