import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLink } from "./api";
import {
  ACTIVE_PROJECT_LINK_LS_KEY,
  adoDiscoverySignature,
  applyAdoDiscoveryToProjectLinkInput,
  loadStoredActiveProjectLinkId,
  pickRecommendedPipeline,
  resolveActiveProjectLinkId,
  saveStoredActiveProjectLinkId,
} from "./projectLinks";

function installLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  });
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickRecommendedPipeline", () => {
  it("prefers repo-specific CI pipelines over release pipelines", () => {
    const selected = pickRecommendedPipeline([
      {
        id: "1",
        name: "web-app release deploy",
        description: "\\release",
        url: "",
      },
      {
        id: "2",
        name: "web-app CI validation",
        description: "\\.azure-pipelines",
        url: "",
      },
      {
        id: "3",
        name: "shared build",
        description: "\\shared",
        url: "",
      },
    ], {
      repoPath: "C:\\work\\web-app",
      adoRepoName: "web-app",
      adoProject: "Platform",
    });

    expect(selected).toMatchObject({ id: "2", name: "web-app CI validation" });
  });

  it("returns the only pipeline when discovery has one result", () => {
    const selected = pickRecommendedPipeline([
      { id: "42", name: "Only pipeline", description: "", url: "" },
    ], {});

    expect(selected).toMatchObject({ id: "42" });
  });
});

describe("ADO Project Link discovery state", () => {
  it("builds a stable trimmed discovery signature", () => {
    expect(adoDiscoverySignature("repositories", {
      adoOrgUrl: " https://dev.azure.com/demo ",
      adoProject: " Project ",
      adoRepoName: " Repo ",
    } as ProjectLink)).toBe(JSON.stringify({
      kind: "repositories",
      org: "https://dev.azure.com/demo",
      project: "Project",
      repo: "Repo",
    }));
  });

  it("resets repo field when a different ADO project is selected", () => {
    const next = applyAdoDiscoveryToProjectLinkInput({
      adoProject: "Old",
      adoRepoName: "repo",
    } as ProjectLink, "projects", {
      id: "project-1",
      name: "New",
      description: "",
      url: "",
    });

    expect(next).toMatchObject({
      adoProject: "New",
      adoRepoName: "",
    });
  });
});

describe("active Project Link persistence", () => {
  it("stores the active Project Link under the canonical key", () => {
    localStorage.clear();

    saveStoredActiveProjectLinkId("project-link-2");

    expect(localStorage.getItem(ACTIVE_PROJECT_LINK_LS_KEY)).toBe("project-link-2");
    expect(loadStoredActiveProjectLinkId()).toBe("project-link-2");
  });

  it("resolves a persisted Project Link before falling back to the first link", () => {
    localStorage.clear();
    saveStoredActiveProjectLinkId("project-link-2");

    const resolved = resolveActiveProjectLinkId([
      { id: "project-link-1", name: "PL 1" },
      { id: "project-link-2", name: "PL 2" },
    ] as ProjectLink[]);

    expect(resolved).toBe("project-link-2");
  });
});
