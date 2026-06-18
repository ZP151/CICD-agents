import { describe, expect, it } from "vitest";
import { projectLinkIdFromChatPayload } from "../src/routes/chat.routes.js";
import { projectLinkIdFromWorkflowActionPayload } from "../src/routes/chat-workflow.routes.js";

describe("chat Project Link identity", () => {
  it("reads Project Link identity for chat sessions", () => {
    expect(projectLinkIdFromChatPayload({ projectLinkId: "project-link-1" })).toBe("project-link-1");
    expect(projectLinkIdFromChatPayload({})).toBeUndefined();
  });

  it("reads Project Link identity for workflow actions", () => {
    expect(projectLinkIdFromWorkflowActionPayload({ projectLinkId: "project-link-1" })).toBe("project-link-1");
    expect(projectLinkIdFromWorkflowActionPayload({})).toBeUndefined();
  });
});
