import { describe, expect, it } from "vitest";
import { taskStatusFromStream } from "./useTaskRuns.js";

describe("taskStatusFromStream", () => {
  it("keeps the daemon's string status", () => {
    expect(taskStatusFromStream("running")).toBe("running");
  });

  it("accepts the explicit status field when a stream wrapper is used", () => {
    expect(taskStatusFromStream({ status: "completed" })).toBe("completed");
  });

  it("does not leak arbitrary event objects into task status text", () => {
    expect(taskStatusFromStream({ detail: "unexpected" })).toBeNull();
    expect(taskStatusFromStream(["running"])).toBeNull();
  });
});
