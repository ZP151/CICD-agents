import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HealthStatus } from "../api.js";
import { dashboardHealthSummary, DashboardRuntimeDetails } from "./Dashboard.js";

const health: HealthStatus = {
  ok: true,
  uptimeSec: 83,
  llmConfigured: true,
};

describe("Dashboard runtime status", () => {
  it("summarizes runtime state in user-facing language", () => {
    expect(dashboardHealthSummary(health)).toEqual({
      label: "Runtime ready",
      tone: "success",
      rows: [
        { label: "Service", value: "Available" },
        { label: "Uptime", value: "83 seconds" },
        { label: "Model access", value: "Configured" },
      ],
    });
  });

  it("renders compact shared workbench rows instead of a standalone dashboard card", () => {
    const html = renderToStaticMarkup(createElement(DashboardRuntimeDetails, { data: health }));

    expect(html).toContain("Runtime status");
    expect(html).toContain("Service");
    expect(html).toContain("Model access");
    expect(html).toContain("divide-y");
  });
});
