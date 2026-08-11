import { describe, expect, it, vi } from "vitest";
import { queryAzureWorkItems } from "../src/ado/index.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function workItemEntry(id: number) {
  return {
    id,
    rev: 1,
    fields: {
      "System.WorkItemType": "Task",
      "System.Title": `Task ${id}`,
      "System.State": "New",
      "System.IterationPath": "Agents\\Sprint 1",
    },
    relations: [],
  };
}

/**
 * The flat WIQL may return more ids than the `top` hint (ADO can ignore it
 * for complex queries), and ADO caps a batch work-item read at 200 ids per
 * request (VS403474). The query must chunk the ids into 200-id batches and
 * merge the results instead of sending one oversized request.
 */
describe("queryAzureWorkItems batching", () => {
  it("chunks an oversized WIQL result into 200-id detail reads and merges", async () => {
    const ids = Array.from({ length: 250 }, (_, index) => 1000 + index);
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ workItems: ids.map((id) => ({ id })) }))
      .mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        const match = url.match(/ids=([^&]+)/);
        const chunk = (match?.[1] ?? "").split(",").map(Number);
        return jsonResponse({ value: chunk.map(workItemEntry) });
      });

    const entries = await queryAzureWorkItems({
      organization: "demo-org",
      project: "Agents",
      query: "SELECT [System.Id] FROM WorkItems",
      pat: "test-pat",
      top: 5,
    });

    expect(entries.length).toBe(250);
    expect(entries[0]!.id).toBe(1000);
    expect(entries[249]!.id).toBe(1249);
    const detailCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes("_apis/wit/workitems?ids="));
    expect(detailCalls.length).toBe(2);
    expect(detailCalls[0]!.match(/ids=([^&]+)/)![1]!.split(",").length).toBe(200);
    expect(detailCalls[1]!.match(/ids=([^&]+)/)![1]!.split(",").length).toBe(50);
  });

  it("surfaces a failed detail batch instead of returning an empty list", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ workItems: [{ id: 7 }] }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }));

    await expect(queryAzureWorkItems({
      organization: "demo-org",
      project: "Agents",
      query: "SELECT [System.Id] FROM WorkItems",
      pat: "test-pat",
    })).rejects.toThrow(/Work item details read failed \(500\)/);
  });

  it("returns an empty list when the query itself has no rows", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ workItems: [] }));

    const entries = await queryAzureWorkItems({
      organization: "demo-org",
      project: "Agents",
      query: "SELECT [System.Id] FROM WorkItems WHERE [System.AssignedTo] = @me",
      pat: "test-pat",
    });
    expect(entries).toEqual([]);
  });
});
