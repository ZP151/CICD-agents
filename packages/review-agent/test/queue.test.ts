import { describe, expect, it } from "vitest";
import { IdempotentQueue } from "../src/queue.js";

describe("IdempotentQueue", () => {
  it("drops duplicates with the same key", async () => {
    const seen: string[] = [];
    const queue = new IdempotentQueue<unknown>(async (job) => {
      seen.push(job.key);
      await new Promise((r) => setTimeout(r, 10));
    });
    void queue.start();
    expect(queue.enqueue({ key: "a", payload: 1 })).toBe("queued");
    expect(queue.enqueue({ key: "a", payload: 1 })).toBe("duplicate");
    expect(queue.enqueue({ key: "b", payload: 2 })).toBe("queued");
    await new Promise((r) => setTimeout(r, 80));
    queue.stop();
    expect(seen.sort()).toEqual(["a", "b"]);
  });

  it("considers historical keys as duplicates", async () => {
    let started = 0;
    const queue = new IdempotentQueue<unknown>(async () => {
      started++;
    });
    void queue.start();
    queue.enqueue({ key: "x", payload: 0 });
    await new Promise((r) => setTimeout(r, 30));
    expect(queue.hasSeen("x")).toBe(true);
    expect(queue.enqueue({ key: "x", payload: 0 })).toBe("duplicate");
    queue.stop();
    expect(started).toBe(1);
  });
});
