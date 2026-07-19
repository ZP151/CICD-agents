import { describe, expect, it } from "vitest";
import { DESKTOP_VERSION } from "../buildInfo.js";
import {
  canAttemptDaemonRecovery,
  daemonInfoWithRuntimeOwner,
  daemonRecoveryGuidance,
  daemonTrustProblem,
} from "./daemonGate.js";

describe("daemonTrustProblem", () => {
  it("accepts the daemon started by the matching desktop sidecar", () => {
    expect(
      daemonTrustProblem({
        ok: true,
        version: DESKTOP_VERSION,
        runtimeMode: "desktop-sidecar",
        desktopVersion: DESKTOP_VERSION,
      }),
    ).toBeNull();
  });

  it("rejects a stale daemon version on the shared runtime port", () => {
    expect(
      daemonTrustProblem({
        ok: true,
        version: "0.5.22",
        runtimeMode: "desktop-sidecar",
        desktopVersion: DESKTOP_VERSION,
      }),
    ).toContain(`Expected daemon ${DESKTOP_VERSION}, got 0.5.22.`);
  });

  it("rejects a source daemon even when the version matches", () => {
    expect(
      daemonTrustProblem({
        ok: true,
        version: DESKTOP_VERSION,
        runtimeMode: "source",
        desktopVersion: "",
      }),
    ).toContain("Expected daemon mode desktop-sidecar, got source.");
  });
});

describe("daemonInfoWithRuntimeOwner", () => {
  it("fills stale runtime process details from the desktop port owner probe", () => {
    expect(
      daemonInfoWithRuntimeOwner(
        {
          state: "mismatch",
          llmConfigured: true,
          cloudProjectLinkStore: true,
          cloudSecrets: false,
          cloudSessions: true,
          expectedVersion: DESKTOP_VERSION,
          actualVersion: "0.5.22",
        },
        {
          port: 8787,
          pid: 21932,
          path: "C:\\repos\\MergePilot\\.tools\\node.exe",
          commandLine: "node src/bin.ts",
          recoverable: true,
        },
      ),
    ).toMatchObject({
      state: "mismatch",
      pid: 21932,
      execPath: "C:\\repos\\MergePilot\\.tools\\node.exe",
      commandLine: "node src/bin.ts",
      ownerRecoverable: true,
    });
  });

  it("keeps health-derived info when no listening owner is found", () => {
    expect(
      daemonInfoWithRuntimeOwner(
        {
          state: "failed",
          llmConfigured: false,
          cloudProjectLinkStore: false,
          cloudSecrets: false,
          cloudSessions: false,
          pid: 10,
          execPath: "C:\\Program Files\\MergePilot\\mergepilot-daemon.exe",
        },
        null,
      ),
    ).toMatchObject({
      state: "failed",
      pid: 10,
      execPath: "C:\\Program Files\\MergePilot\\mergepilot-daemon.exe",
    });
  });
});

describe("daemon runtime recovery helpers", () => {
  it("allows recovery when a failed startup still has a recoverable MergePilot owner", () => {
    const info = daemonInfoWithRuntimeOwner(
      {
        state: "failed",
        llmConfigured: false,
        cloudProjectLinkStore: false,
        cloudSecrets: false,
        cloudSessions: false,
      },
      {
        port: 8787,
        pid: 40348,
        path: "C:\\Program Files\\MergePilot\\mergepilot-daemon.exe",
        commandLine: '"\\\\?\\C:\\Program Files\\MergePilot\\mergepilot-daemon.exe" --port 8787',
        recoverable: true,
      },
    );

    expect(canAttemptDaemonRecovery(info)).toBe(true);
    expect(daemonRecoveryGuidance(info)).toContain("Restart the bundled daemon");
  });

  it("blocks automatic recovery for an unexpected process owner", () => {
    const info = daemonInfoWithRuntimeOwner(
      {
        state: "mismatch",
        llmConfigured: false,
        cloudProjectLinkStore: false,
        cloudSecrets: false,
        cloudSessions: false,
      },
      {
        port: 8787,
        pid: 991,
        path: "C:\\Windows\\System32\\svchost.exe",
        commandLine: "svchost.exe",
        recoverable: false,
      },
    );

    expect(canAttemptDaemonRecovery(info)).toBe(false);
    expect(daemonRecoveryGuidance(info)).toContain("Close the process using port 8787");
  });
});
