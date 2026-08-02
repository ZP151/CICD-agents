import { describe, expect, it } from "vitest";
import { isTemporaryActivity, partitionActivity } from "./activityGrouping.js";

describe("activityGrouping", () => {
  it("keeps persisted workspace history in the primary activity stream", () => {
    const activity = [
      { id: "saved", projectLinkId: "saved-link", projectLinkName: "ClaimBot_API link" },
      { id: "temporary", projectLinkId: "live-link", projectLinkName: "MP-live-smoke" },
    ];

    expect(partitionActivity(activity, new Set(["live-link"]))).toEqual({
      primary: [activity[0]],
      temporary: [activity[1]],
    });
  });

  it("still recognizes stale temporary activity after its transient link is deleted", () => {
    expect(
      isTemporaryActivity(
        { repoPath: "C:\\Users\\15492\\AppData\\Local\\Temp\\mergepilot-live-run\\repo" },
        new Set(),
      ),
    ).toBe(true);
  });
});
