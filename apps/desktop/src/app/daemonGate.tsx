import { useEffect, useRef, useState, type ReactNode } from "react";
import { fetchHealth, inspectRuntimePortOwner, recoverDaemonRuntime, runtimeUrl } from "../api.js";
import type { HealthStatus } from "../api.js";
import type { RuntimePortOwner } from "../api/desktopRuntime.js";
import { DESKTOP_BUILD_SHA, DESKTOP_VERSION } from "../buildInfo.js";

export type DaemonState = "starting" | "ready" | "failed" | "mismatch";

export interface DaemonInfo {
  state: DaemonState;
  llmConfigured: boolean;
  cloudProjectLinkStore: boolean;
  cloudSecrets: boolean;
  cloudSessions: boolean;
  expectedVersion?: string;
  actualVersion?: string;
  runtimeMode?: string;
  sidecarDesktopVersion?: string;
  expectedBuildSha?: string;
  actualBuildSha?: string;
  trustProblem?: string;
  pid?: number;
  execPath?: string;
  commandLine?: string;
  ownerRecoverable?: boolean;
}

const failedDaemonInfo: DaemonInfo = {
  state: "failed",
  llmConfigured: false,
  cloudProjectLinkStore: false,
  cloudSecrets: false,
  cloudSessions: false,
};

const expectedRuntimeMode = "desktop-sidecar";

export function daemonTrustProblem(health: HealthStatus): string | null {
  if (health.version !== DESKTOP_VERSION) {
    return `Expected daemon ${DESKTOP_VERSION}, got ${health.version ?? "unknown"}.`;
  }
  if (health.runtimeMode !== expectedRuntimeMode) {
    return `Expected daemon mode ${expectedRuntimeMode}, got ${health.runtimeMode ?? "unknown"}.`;
  }
  if (health.desktopVersion !== DESKTOP_VERSION) {
    return `Expected sidecar desktop ${DESKTOP_VERSION}, got ${health.desktopVersion ?? "unknown"}.`;
  }
  return null;
}

function isTrustedDaemon(health: HealthStatus): boolean {
  return daemonTrustProblem(health) === null;
}

function daemonInfoFromHealth(health: HealthStatus, state: DaemonState): DaemonInfo {
  return {
    state,
    llmConfigured: health.llmConfigured ?? false,
    cloudProjectLinkStore: health.cloudProjectLinkStore ?? false,
    cloudSecrets: health.cloudSecrets ?? false,
    cloudSessions: health.cloudSessions ?? false,
    expectedVersion: DESKTOP_VERSION,
    actualVersion: health.version,
    runtimeMode: health.runtimeMode,
    sidecarDesktopVersion: health.desktopVersion,
    expectedBuildSha: DESKTOP_BUILD_SHA,
    actualBuildSha: health.buildSha,
    trustProblem: daemonTrustProblem(health) ?? undefined,
    pid: health.pid,
    execPath: health.execPath,
  };
}

export function daemonInfoWithRuntimeOwner(
  info: DaemonInfo,
  owner: RuntimePortOwner | null,
): DaemonInfo {
  if (!owner?.pid) return info;
  return {
    ...info,
    pid: owner.pid ?? info.pid,
    execPath: owner.path ?? info.execPath,
    commandLine: owner.commandLine ?? info.commandLine,
    ownerRecoverable: owner.recoverable,
  };
}

export function canAttemptDaemonRecovery(info: DaemonInfo): boolean {
  return Boolean(info.pid) && info.ownerRecoverable !== false;
}

export function daemonRecoveryGuidance(info: DaemonInfo): string {
  if (info.ownerRecoverable === false) {
    return "Close the process using port 8787, then restart MergePilot so the bundled daemon can start.";
  }
  if (info.state === "failed") {
    return "Restart the bundled daemon to stop the stale MergePilot runtime using port 8787 and reconnect this desktop build.";
  }
  return "Restart the bundled daemon to stop the stale MergePilot runtime and reconnect this desktop build.";
}

function useDaemonReady(retryKey: number): DaemonInfo {
  const [info, setInfo] = useState<DaemonInfo>({
    state: "starting",
    llmConfigured: false,
    cloudProjectLinkStore: false,
    cloudSecrets: false,
    cloudSessions: false,
    expectedVersion: DESKTOP_VERSION,
  });
  const attempts = useRef(0);

  useEffect(() => {
    attempts.current = 0;
    if (!("__TAURI__" in window)) {
      setInfo({
        state: "ready",
        llmConfigured: true,
        cloudProjectLinkStore: false,
        cloudSecrets: false,
        cloudSessions: false,
      });
      return;
    }

    let cancelled = false;
    const maxAttempts = 30;

    async function poll() {
      while (attempts.current < maxAttempts && !cancelled) {
        try {
          const health = await fetchHealth();
          if (!cancelled) {
            const nextInfo = daemonInfoFromHealth(health, isTrustedDaemon(health) ? "ready" : "mismatch");
            if (nextInfo.state === "mismatch") {
              const owner = await inspectRuntimePortOwner().catch(() => null);
              if (!cancelled) setInfo(daemonInfoWithRuntimeOwner(nextInfo, owner));
            } else {
              setInfo(nextInfo);
            }
          }
          return;
        } catch {
          attempts.current += 1;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      if (!cancelled) {
        const owner = await inspectRuntimePortOwner().catch(() => null);
        if (!cancelled) setInfo(daemonInfoWithRuntimeOwner(failedDaemonInfo, owner));
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [retryKey]);

  return info;
}

export function DaemonGate({ children }: { children: (info: DaemonInfo) => ReactNode }) {
  const [retryKey, setRetryKey] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const info = useDaemonReady(retryKey);

  async function handleRecoverRuntime() {
    setRecovering(true);
    setRecoveryError(null);
    try {
      await recoverDaemonRuntime();
      setTimeout(() => setRetryKey((current) => current + 1), 650);
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRecovering(false);
    }
  }

  if (info.state === "starting") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[rgb(var(--app-bg))] text-[rgb(var(--app-text-muted))]">
        <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
        <span className="text-sm">Starting daemon...</span>
      </div>
    );
  }

  if (info.state === "failed") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[rgb(var(--app-bg))] text-[rgb(var(--app-text-muted))]">
        <svg className="h-6 w-6 text-[rgb(var(--app-danger))]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
        <p className="text-sm font-medium text-[rgb(var(--app-text))]">Daemon failed to start</p>
        <p className="max-w-xs text-center text-xs text-[rgb(var(--app-text-subtle))]">
          The background service did not respond after 30 seconds.
        </p>
        <p className="max-w-sm text-center text-xs text-[rgb(var(--app-text-subtle))]">
          {daemonRecoveryGuidance(info)}
        </p>
        {recoveryError ? (
          <p className="max-w-sm rounded-md border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] p-2 text-xs text-[rgb(var(--app-danger))]">
            {recoveryError}
          </p>
        ) : null}
        {info.execPath ? (
          <p className="max-w-sm break-all rounded-md bg-[rgb(var(--app-bg-muted))] p-2 font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">
            {info.execPath}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2 pt-1">
          {canAttemptDaemonRecovery(info) ? (
            <button
              type="button"
              onClick={handleRecoverRuntime}
              disabled={recovering}
              className="rounded-md bg-[rgb(var(--app-accent))] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {recovering ? "Restarting..." : "Restart bundled daemon"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setRecoveryError(null);
              setRetryKey((current) => current + 1);
            }}
            disabled={recovering}
            className="rounded-md border border-[rgb(var(--app-border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Check again
          </button>
        </div>
      </div>
    );
  }

  if (info.state === "mismatch") {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[rgb(var(--app-bg))] px-6 text-[rgb(var(--app-text-muted))]">
        <div className="w-full max-w-lg rounded-lg border border-[rgb(var(--app-warning-border))] bg-[rgb(var(--app-surface))] p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-6 w-6 flex-none text-[rgb(var(--app-warning))]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <div className="min-w-0 space-y-3">
              <div>
                <p className="text-sm font-semibold text-[rgb(var(--app-text))]">
                  Runtime version mismatch
                </p>
                <p className="mt-1 text-sm text-[rgb(var(--app-text-muted))]">
                  MergePilot is connected to a daemon that was not started by this desktop build.
                </p>
                {info.trustProblem ? (
                  <p className="mt-2 text-xs text-[rgb(var(--app-warning))]">
                    {info.trustProblem}
                  </p>
                ) : null}
              </div>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 rounded-md bg-[rgb(var(--app-bg-muted))] p-3 text-xs">
                <dt>Desktop</dt>
                <dd className="font-mono text-[rgb(var(--app-text))]">{info.expectedVersion}</dd>
                <dt>Daemon</dt>
                <dd className="font-mono text-[rgb(var(--app-text))]">{info.actualVersion ?? "unknown"}</dd>
                <dt>Mode</dt>
                <dd className="font-mono text-[rgb(var(--app-text))]">{info.runtimeMode ?? "unknown"}</dd>
                {info.expectedBuildSha || info.actualBuildSha ? (
                  <>
                    <dt>Build</dt>
                    <dd className="font-mono text-[rgb(var(--app-text))]">
                      {(info.actualBuildSha || "unknown").slice(0, 12)}
                      {info.expectedBuildSha && info.actualBuildSha !== info.expectedBuildSha
                        ? ` expected ${info.expectedBuildSha.slice(0, 12)}`
                        : ""}
                    </dd>
                  </>
                ) : null}
                <dt>Port</dt>
                <dd className="font-mono text-[rgb(var(--app-text))]">{runtimeUrl}</dd>
                {info.pid ? (
                  <>
                    <dt>PID</dt>
                    <dd className="font-mono text-[rgb(var(--app-text))]">{info.pid}</dd>
                  </>
                ) : null}
              </dl>
              <p className="text-xs text-[rgb(var(--app-text-subtle))]">
                {daemonRecoveryGuidance(info)}
              </p>
              {recoveryError ? (
                <p className="rounded-md border border-[rgb(var(--app-danger-border))] bg-[rgb(var(--app-danger-soft))] p-2 text-xs text-[rgb(var(--app-danger))]">
                  {recoveryError}
                </p>
              ) : null}
              {info.execPath ? (
                <p className="break-all rounded-md bg-[rgb(var(--app-bg-muted))] p-2 font-mono text-[11px] text-[rgb(var(--app-text-subtle))]">
                  {info.execPath}
                </p>
              ) : null}
              {info.commandLine && info.commandLine !== info.execPath ? (
                <details className="rounded-md bg-[rgb(var(--app-bg-muted))] p-2 text-[11px] text-[rgb(var(--app-text-subtle))]">
                  <summary className="cursor-pointer font-medium text-[rgb(var(--app-text-muted))]">
                    Process command
                  </summary>
                  <p className="mt-2 break-all font-mono">{info.commandLine}</p>
                </details>
              ) : null}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRecoverRuntime}
                  disabled={recovering || info.ownerRecoverable === false}
                  className="rounded-md bg-[rgb(var(--app-accent))] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {recovering ? "Restarting..." : "Restart bundled daemon"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecoveryError(null);
                    setRetryKey((current) => current + 1);
                  }}
                  disabled={recovering}
                  className="rounded-md border border-[rgb(var(--app-border))] px-3 py-1.5 text-xs font-medium text-[rgb(var(--app-text))] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Check again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children(info)}</>;
}
