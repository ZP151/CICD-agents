import { describe, expect, it, vi } from "vitest";
import {
  PipelineTargetResolver,
  pipelineTargetFromSelection,
} from "../src/pipelineTargetResolver.js";
import { AzureAuthenticationRequiredError } from "../src/store/azureAuthTypes.js";
import type { AdoAuth } from "../src/ado/auth.js";

const auth: AdoAuth = { mode: "oauth", header: "Bearer example" };

function resolverWith(
  definitions: Array<{ id: number; name: string; description?: string }>,
  opts: { capabilityMessage?: string; throwOnList?: unknown } = {},
): PipelineTargetResolver {
  const listDefinitions = vi.fn(async () => {
    if (opts.throwOnList) throw opts.throwOnList;
    return definitions;
  });
  return new PipelineTargetResolver({
    listDefinitions,
    capabilityGate: opts.capabilityMessage ? () => opts.capabilityMessage : undefined,
  });
}

const baseLink = {
  adoOrgUrl: "https://example-org.visualstudio.com/",
  adoProject: "example-project",
  adoRepoName: "example-repo",
  adoPat: "",
};

describe("PipelineTargetResolver (MP-010)", () => {
  it("resolves an explicit pipeline ID without discovery (RA-042)", async () => {
    const resolver = resolverWith([]);

    const result = await resolver.resolve({ explicitId: 42, projectLink: baseLink, auth });

    expect(result).toMatchObject({ status: "resolved", pipelineId: 42, source: "explicit_id" });
  });

  it("resolves the persisted Project Link pipeline ID (RA-042)", async () => {
    const resolver = resolverWith([]);

    const result = await resolver.resolve({
      projectLink: { ...baseLink, adoPipelineId: "117", adoPipelineName: "CI" },
      auth,
    });

    expect(result).toMatchObject({ status: "resolved", pipelineId: 117, source: "project_link_id" });
  });

  it("resolves a unique pipeline name via repository-filtered discovery (RA-043)", async () => {
    const resolver = resolverWith([
      { id: 7, name: "CI" },
      { id: 9, name: "Release" },
    ]);

    const result = await resolver.resolve({
      projectLink: { ...baseLink, adoPipelineName: "Release" },
      auth,
    });

    expect(result).toMatchObject({ status: "resolved", pipelineId: 9, pipelineName: "Release", source: "name_discovery" });
  });

  it("returns candidates for same-name pipelines and never auto-picks (RA-044)", async () => {
    const resolver = resolverWith([
      { id: 7, name: "CI" },
      { id: 8, name: "CI" },
    ]);

    const result = await resolver.resolve({
      projectLink: { ...baseLink, adoPipelineName: "CI" },
      auth,
    });

    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toEqual([
      { id: 7, name: "CI", description: undefined },
      { id: 8, name: "CI", description: undefined },
    ]);
    expect(result.pipelineId).toBeUndefined();
  });

  it("reports not_found instead of faking a connector failure (RA-045)", async () => {
    const resolver = resolverWith([{ id: 7, name: "CI" }]);

    const result = await resolver.resolve({
      projectLink: { ...baseLink, adoPipelineName: "MissingPipeline" },
      auth,
    });

    expect(result.status).toBe("not_found");
    expect(result.message).toContain("MissingPipeline");
  });

  it("classifies expired or missing tokens as unauthorized (RA-046)", async () => {
    const resolver = resolverWith([], { throwOnList: new AzureAuthenticationRequiredError() });

    const result = await resolver.resolve({
      projectLink: { ...baseLink, adoPipelineName: "CI" },
      auth,
    });

    expect(result.status).toBe("unauthorized");
  });

  it("reports capability_missing when the pipelines domain is gated off (RA-048)", async () => {
    const resolver = resolverWith([], { capabilityMessage: "pipelines domain is not enabled for this connector." });

    const result = await resolver.resolve({ projectLink: baseLink, auth });

    expect(result.status).toBe("capability_missing");
    expect(result.message).toContain("pipelines domain");
  });

  it("reports connector_unavailable for non-auth connector failures", async () => {
    const resolver = resolverWith([], { throwOnList: new Error("server not reachable") });

    const result = await resolver.resolve({
      projectLink: { ...baseLink, adoPipelineName: "CI" },
      auth,
    });

    expect(result.status).toBe("connector_unavailable");
  });

  it("applies a user selection from an ambiguous result (RA-047)", () => {
    const ambiguous = {
      status: "ambiguous" as const,
      candidates: [
        { id: 7, name: "CI", description: undefined },
        { id: 8, name: "CI", description: undefined },
      ],
      source: "name_discovery" as const,
      message: "Multiple pipelines are named CI.",
    };

    expect(pipelineTargetFromSelection(ambiguous, 8)).toMatchObject({
      status: "resolved",
      pipelineId: 8,
      source: "user_selection",
    });
    expect(pipelineTargetFromSelection(ambiguous, 99).status).toBe("ambiguous");
  });

  it("reports when no pipeline is configured at all", async () => {
    const resolver = resolverWith([]);

    const result = await resolver.resolve({ projectLink: baseLink, auth });

    expect(result.status).toBe("not_found");
    expect(result.source).toBe("none");
  });
});
