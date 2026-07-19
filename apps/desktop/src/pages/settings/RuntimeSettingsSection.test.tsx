import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { HealthStatus } from "../../api.js";
import { DESKTOP_VERSION } from "../../buildInfo.js";
import {
  RuntimeSettingsSection,
  runtimeBuildShaClass,
  runtimeModeLabelClass,
  runtimeOwnerCompactLabel,
  runtimeOwnerLabel,
  runtimeOwnerTone,
  runtimeProcessLabel,
  runtimeVersionTone,
} from "./RuntimeSettingsSection.js";

describe("RuntimeSettingsSection", () => {
  it("shows matching desktop-sidecar runtime metadata as healthy", () => {
    const health: HealthStatus = {
      ok: true,
      version: DESKTOP_VERSION,
      runtimeMode: "desktop-sidecar",
      desktopVersion: DESKTOP_VERSION,
      pid: 40348,
      execPath: "C:\\Program Files\\MergePilot\\mergepilot-daemon.exe",
    };
    const html = renderToStaticMarkup(<RuntimeSettingsSection health={health} />);

    expect(runtimeVersionTone(health)).toBe("success");
    expect(runtimeOwnerTone(health)).toBe("success");
    expect(runtimeOwnerLabel(health)).toBe(`desktop-sidecar · ${DESKTOP_VERSION}`);
    expect(runtimeOwnerCompactLabel(health)).toBe("Installed");
    expect(runtimeProcessLabel(health)).toContain("PID 40348");
    expect(html).toContain("System");
    expect(html).toContain("Desktop");
    expect(html).toContain("Daemon");
    expect(html).toContain("Owner");
    expect(html).toContain("Runtime details");
    expect(html).toContain("mergepilot-daemon.exe");
  });

  it("bounds runtime metadata by the Settings control column", () => {
    expect(runtimeBuildShaClass()).toContain("min-w-0");
    expect(runtimeBuildShaClass()).toContain("max-w-[min(12rem,100%)]");
    expect(runtimeBuildShaClass()).not.toContain("max-w-[12rem]");
    expect(runtimeModeLabelClass()).toContain("min-w-0");
    expect(runtimeModeLabelClass()).toContain("max-w-[min(18rem,100%)]");
    expect(runtimeModeLabelClass()).not.toContain("max-w-[18rem]");
  });

  it("warns when a stale or non-sidecar daemon owns the runtime", () => {
    const health: HealthStatus = {
      ok: true,
      version: "0.5.23",
      runtimeMode: "source",
      desktopVersion: "",
      pid: 21932,
      execPath: "C:\\repos\\MergePilot\\.tools\\node.exe",
    };

    expect(runtimeVersionTone(health)).toBe("warning");
    expect(runtimeOwnerTone(health)).toBe("warning");
    expect(runtimeOwnerLabel(health)).toBe("source · no desktop version");
    expect(runtimeOwnerCompactLabel(health)).toBe("source");
  });

  it("keeps the section useful when daemon health is unavailable", () => {
    const html = renderToStaticMarkup(<RuntimeSettingsSection health={null} />);

    expect(runtimeVersionTone(null)).toBe("neutral");
    expect(runtimeOwnerTone(null)).toBe("neutral");
    expect(runtimeOwnerLabel(null)).toBe("Unknown");
    expect(runtimeOwnerCompactLabel(null)).toBe("Unknown");
    expect(runtimeProcessLabel(null)).toBe("Not reported");
    expect(html).toContain("Unknown");
    expect(html).toContain("Not reported");
  });
});
