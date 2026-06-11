import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceProfile } from "./api";
import {
  ACTIVE_PROJECT_LINK_LS_KEY,
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

describe("active Project Link persistence", () => {
  it("stores the active Project Link under the shared and legacy chat keys", () => {
    localStorage.clear();

    saveStoredActiveProjectLinkId("profile-2");

    expect(localStorage.getItem(ACTIVE_PROJECT_LINK_LS_KEY)).toBe("profile-2");
    expect(localStorage.getItem("chat_profile_id")).toBe("profile-2");
    expect(loadStoredActiveProjectLinkId()).toBe("profile-2");
  });

  it("resolves a persisted Project Link before falling back to the first link", () => {
    localStorage.clear();
    saveStoredActiveProjectLinkId("profile-2");

    const resolved = resolveActiveProjectLinkId([
      { id: "profile-1", name: "PL 1" },
      { id: "profile-2", name: "PL 2" },
    ] as WorkspaceProfile[]);

    expect(resolved).toBe("profile-2");
  });
});
