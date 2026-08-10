import { describe, expect, it } from "vitest";
import {
  buildRecoveryBugTitle,
  deliveryRecoveryActionSummary,
} from "./DeliveryRunInspector.js";

describe("DeliveryRunInspector recovery proposals", () => {
  it("uses a production-facing bug title instead of a fixture marker", () => {
    expect(buildRecoveryBugTitle("20260810.4", "code_regression"))
      .toBe("CI failure 20260810.4 (code_regression)");
  });

  it("renders recovery approvals without coercing payload objects", () => {
    expect(deliveryRecoveryActionSummary({
      kind: "pipeline.trigger",
      payload: { pipelineId: 117, branch: "main" },
    })).toBe("Rerun pipeline #117 on main");

    expect(deliveryRecoveryActionSummary({
      kind: "work_item.create",
      payload: { title: { value: "invalid" } },
    })).toBe("Create a bug from this pipeline failure");
  });
});
