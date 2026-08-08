import { describe, expect, it } from "vitest";
import {
  storedSessionProjectLinkId,
  type StoredSession,
} from "../src/chatHistoryStore.js";
import {
  normalizeSession,
  storedToCosmos,
} from "../src/chatHistorySerialization.js";

function session(overrides: Partial<StoredSession>): StoredSession {
  return {
    id: "chat-1",
    createdAt: 1,
    repoPath: "C:/repo",
    messages: [],
    bubbles: [],
    ...overrides,
  };
}

const inlineProjectLinkWithPat = {
  id: "project-link-1",
  name: "ClaimBot_API link",
  repoPath: "C:/repo",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://tebssg.visualstudio.com/",
  adoProject: "TeBS-ClaimBot",
  adoRepoName: "ClaimBot_API",
  adoPat: "secret-pat-123",
  adoPipelineId: "117",
  adoPipelineName: "ClaimBot_API",
  adoMcpEnabled: false,
  adoMcpDomains: "",
  buildCommand: "",
  testCommand: "",
};

describe("chatHistoryStore Project Link helpers", () => {
  it("reads Project Link ids", () => {
    expect(storedSessionProjectLinkId(session({
      projectLinkId: "project-link-1",
    }))).toBe("project-link-1");
  });

  it("returns undefined when no Project Link id is stored", () => {
    expect(storedSessionProjectLinkId(session({}))).toBeUndefined();
  });
});

describe("session credential containment (ADR-0005, 4a-1)", () => {
  it("normalizeSession redacts the inline PAT placeholder in place", () => {
    const stored = session({ inlineProjectLink: { ...inlineProjectLinkWithPat } });
    const normalized = normalizeSession(stored);
    expect(normalized.inlineProjectLink?.adoPat).toBe("");
    expect(JSON.stringify(normalized)).not.toContain("secret-pat-123");
  });

  it("storedToCosmos never carries the inline PAT value", () => {
    const stored = session({ inlineProjectLink: { ...inlineProjectLinkWithPat } });
    const cosmos = storedToCosmos(stored);
    expect(cosmos.inlineProjectLink?.adoPat).toBe("");
    expect(JSON.stringify(cosmos)).not.toContain("secret-pat-123");
  });

  it("normalizeSession keeps the identity fields intact", () => {
    const stored = session({ inlineProjectLink: { ...inlineProjectLinkWithPat } });
    const normalized = normalizeSession(stored);
    expect(normalized.inlineProjectLink?.adoRepoName).toBe("ClaimBot_API");
    expect(normalized.inlineProjectLink?.adoOrgUrl).toBe("https://tebssg.visualstudio.com/");
    expect(normalized.inlineProjectLink?.adoProject).toBe("TeBS-ClaimBot");
    expect(normalized.inlineProjectLink?.adoPipelineId).toBe("117");
  });
});
