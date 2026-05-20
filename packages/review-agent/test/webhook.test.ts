import { describe, expect, it } from "vitest";
import { AdoPrEventSchema, eventKey } from "../src/webhook.js";

const SAMPLE = {
  eventType: "git.pullrequest.created",
  resource: {
    pullRequestId: 42,
    title: "demo",
    sourceRefName: "refs/heads/feature/x",
    targetRefName: "refs/heads/main",
    repository: {
      id: "repo-uuid",
      name: "demo-repo",
      project: { id: "project-uuid", name: "DemoProject" },
    },
    lastMergeSourceCommit: { commitId: "abcd1234" },
  },
};

describe("AdoPrEvent webhook", () => {
  it("parses a representative PR-created payload", () => {
    const parsed = AdoPrEventSchema.parse(SAMPLE);
    expect(parsed.resource.pullRequestId).toBe(42);
  });

  it("derives a stable idempotency key", () => {
    const parsed = AdoPrEventSchema.parse(SAMPLE);
    const key = eventKey(parsed);
    expect(key).toBe("repo-uuid:42:abcd1234");
  });

  it("rejects payloads without a pullRequestId", () => {
    const bad = { eventType: "x", resource: { repository: { id: "r", name: "n", project: {} } } };
    expect(() => AdoPrEventSchema.parse(bad)).toThrow();
  });
});
