import { afterEach, describe, expect, it, vi } from "vitest";
import { rejectDeliveryAction } from "./delivery.js";

describe("delivery action API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a pending write without executing it", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "work-action-1",
      status: "rejected",
      kind: "work_item.update",
      target: { id: 123 },
      payload: {},
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(rejectDeliveryAction("work-action-1")).resolves.toMatchObject({ status: "rejected" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/delivery\/actions\/work-action-1\/reject$/),
      expect.objectContaining({ method: "POST" }),
    );
  });
});
