import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appendLocalReviewOperation,
  listLocalReviewOperations,
  reviewOperationsStorePath,
} from "../src/reviewOperationsLocal.js";

describe("reviewOperationsLocal", () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cicd-review-operations-"));

  afterEach(() => {
    const p = reviewOperationsStorePath(dataDir);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  it("appends and lists operation records newest first", () => {
    appendLocalReviewOperation(dataDir, {
      kind: "rerun",
      at: "2026-06-11T00:00:00.000Z",
      repository: "demo-repo",
      pullRequestId: 42,
      label: "Rerun review",
      ok: true,
      details: "needs human review",
    });
    appendLocalReviewOperation(dataDir, {
      kind: "ado_retry",
      at: "2026-06-11T00:01:00.000Z",
      repository: "demo-repo",
      pullRequestId: 42,
      label: "Retry ADO",
      ok: false,
      details: "ADO unavailable",
    });
    appendLocalReviewOperation(dataDir, {
      kind: "insight_preview",
      at: "2026-06-11T00:02:00.000Z",
      repository: "demo-repo",
      pullRequestId: 42,
      label: "Preview insight",
      ok: true,
      details: "readiness=ready; risks=0",
    });
    appendLocalReviewOperation(dataDir, {
      kind: "review_run",
      at: "2026-06-11T00:03:00.000Z",
      repository: "demo-repo",
      pullRequestId: 42,
      label: "Review run",
      ok: true,
      details: "queue=needs_human_review; risk=medium",
    });

    expect(listLocalReviewOperations({ dataDir }).map((event) => event.kind)).toEqual([
      "review_run",
      "insight_preview",
      "ado_retry",
      "rerun",
    ]);
  });

  it("filters operation records by repository", () => {
    appendLocalReviewOperation(dataDir, {
      kind: "rerun",
      at: "2026-06-11T00:00:00.000Z",
      repository: "demo-repo",
      pullRequestId: 42,
      label: "Rerun review",
      ok: true,
      details: "done",
    });
    appendLocalReviewOperation(dataDir, {
      kind: "rerun",
      at: "2026-06-11T00:01:00.000Z",
      repository: "other-repo",
      pullRequestId: 7,
      label: "Rerun review",
      ok: true,
      details: "done",
    });

    expect(listLocalReviewOperations({ dataDir, repository: "demo-repo" }).map((event) => event.repository))
      .toEqual(["demo-repo"]);
  });

  it("applies caller limits", () => {
    for (let i = 0; i < 5; i += 1) {
      appendLocalReviewOperation(dataDir, {
        kind: "batch_rerun",
        at: `2026-06-11T00:0${i}:00.000Z`,
        repository: "demo-repo",
        pullRequestId: i + 1,
        label: "Batch rerun",
        ok: true,
        details: "queued",
      });
    }

    expect(listLocalReviewOperations({ dataDir, repository: "demo-repo", limit: 2 }).map((event) => event.pullRequestId))
      .toEqual([5, 4]);
  });

  it("returns an empty list for corrupt stores", () => {
    const p = reviewOperationsStorePath(dataDir);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "{not-json", "utf8");

    expect(listLocalReviewOperations({ dataDir })).toEqual([]);
  });
});
