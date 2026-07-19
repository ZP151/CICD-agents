import { describe, expect, it } from "vitest";
import { freshnessBadgeLabel } from "./StoredInsightPanel.js";

describe("StoredInsightPanel", () => {
  it("uses business wording instead of raw unknown freshness state", () => {
    expect(freshnessBadgeLabel({
      state: "unknown",
      reasons: ["missing_baseline"],
      label: "freshness not available: no saved PR baseline",
    })).toBe("No baseline");

    expect(freshnessBadgeLabel({
      state: "unknown",
      reasons: [],
      label: "freshness not available: current PR baseline unavailable",
    })).toBe("Baseline unavailable");
  });
});
