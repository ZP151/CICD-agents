import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REVIEW_OPERATIONS_LS_KEY,
  appendReviewOperation,
  clearReviewOperations,
  listReviewOperations,
  reviewOperationTarget,
} from "./reviewOperations";

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

describe("review operations", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    clearReviewOperations();
    vi.unstubAllGlobals();
  });

  it("appends and lists operations newest first", () => {
    appendReviewOperation({
      kind: "rerun",
      at: "2026-06-11T00:00:00.000Z",
      repository: "demo",
      pullRequestId: 1,
      label: "Rerun review",
      ok: true,
      details: "Review completed.",
    });
    appendReviewOperation({
      kind: "ado_retry",
      at: "2026-06-11T00:01:00.000Z",
      repository: "demo",
      pullRequestId: 1,
      label: "Retry ADO",
      ok: false,
      details: "ADO unavailable.",
    });
    appendReviewOperation({
      kind: "insight_preview",
      at: "2026-06-11T00:02:00.000Z",
      repository: "demo",
      pullRequestId: 1,
      label: "Preview insight",
      ok: true,
      details: "readiness=ready; risks=0",
    });
    appendReviewOperation({
      kind: "review_run",
      at: "2026-06-11T00:03:00.000Z",
      repository: "demo",
      pullRequestId: 1,
      label: "Review run",
      ok: true,
      details: "queue=needs_human_review; risk=medium",
    });

    expect(listReviewOperations().map((event) => event.kind)).toEqual([
      "review_run",
      "insight_preview",
      "ado_retry",
      "rerun",
    ]);
  });

  it("keeps only the latest 50 operations", () => {
    for (let i = 0; i < 55; i += 1) {
      appendReviewOperation({
        kind: "batch_rerun",
        at: `2026-06-11T00:${String(i).padStart(2, "0")}:00.000Z`,
        repository: "demo",
        pullRequestId: i + 1,
        label: "Batch rerun",
        ok: true,
        details: "Queued.",
      });
    }

    const events = listReviewOperations();
    expect(events).toHaveLength(50);
    expect(events[0]?.pullRequestId).toBe(55);
    expect(events.at(-1)?.pullRequestId).toBe(6);
  });

  it("falls back to an empty list when local storage is corrupt", () => {
    localStorage.setItem(REVIEW_OPERATIONS_LS_KEY, "{not-json");

    expect(listReviewOperations()).toEqual([]);
  });

  it("builds stable operation targets", () => {
    expect(reviewOperationTarget({ repository: "repo", pullRequestId: 42 })).toBe("repo/42");
  });
});
