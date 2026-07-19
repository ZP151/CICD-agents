import type { HealthStatus } from "../../api";
import { DESKTOP_BUILD_SHA, DESKTOP_VERSION } from "../../buildInfo.js";
import { SettingsRow, SettingsSection, StatusPill } from "./SettingsControls.js";

export function runtimeVersionTone(health: HealthStatus | null): "success" | "warning" | "neutral" {
  if (!health) return "neutral";
  return health.version === DESKTOP_VERSION ? "success" : "warning";
}

export function runtimeOwnerTone(health: HealthStatus | null): "success" | "warning" | "neutral" {
  if (!health) return "neutral";
  return health.runtimeMode === "desktop-sidecar" && health.desktopVersion === DESKTOP_VERSION
    ? "success"
    : "warning";
}

export function runtimeOwnerLabel(health: HealthStatus | null): string {
  if (!health) return "Unknown";
  const mode = health.runtimeMode || "unknown mode";
  const desktopVersion = health.desktopVersion || "no desktop version";
  return `${mode} · ${desktopVersion}`;
}

export function runtimeProcessLabel(health: HealthStatus | null): string {
  if (!health?.pid && !health?.execPath) return "Not reported";
  const pid = health.pid ? `PID ${health.pid}` : "PID unknown";
  return health.execPath ? `${pid} · ${health.execPath}` : pid;
}

export function RuntimeSettingsSection({ health }: { health: HealthStatus | null }): JSX.Element {
  return (
    <SettingsSection title="System">
      <div
        className="settings-runtime-summary"
        title={[
          `Desktop: ${DESKTOP_VERSION}${DESKTOP_BUILD_SHA ? ` (${DESKTOP_BUILD_SHA.slice(0, 12)})` : ""}`,
          `Daemon: ${health?.version || "Unknown"} · ${health?.runtimeMode || "No runtime mode"}`,
          `Owner: ${runtimeOwnerLabel(health)}`,
        ].join("\n")}
      >
        <div>
          <p className="settings-runtime-label">Desktop</p>
          <StatusPill tone="success">{DESKTOP_VERSION}</StatusPill>
        </div>
        <div>
          <p className="settings-runtime-label">Daemon</p>
          <StatusPill tone={runtimeVersionTone(health)}>
            {health?.version || "Unknown"}
          </StatusPill>
        </div>
        <div>
          <p className="settings-runtime-label">Owner</p>
          <StatusPill tone={runtimeOwnerTone(health)}>{runtimeOwnerCompactLabel(health)}</StatusPill>
        </div>
      </div>
      <details className="settings-advanced">
        <summary>
          <span>Runtime details</span>
          <span className="settings-advanced-meta">{health?.runtimeMode || "Unknown"}</span>
        </summary>
        <div className="settings-advanced-list">
          <SettingsRow title="Desktop build">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-right">
              <StatusPill tone="success">{DESKTOP_VERSION}</StatusPill>
              {DESKTOP_BUILD_SHA && (
                <span className={runtimeBuildShaClass()}>
                  {DESKTOP_BUILD_SHA.slice(0, 12)}
                </span>
              )}
            </div>
          </SettingsRow>
          <SettingsRow title="Daemon runtime">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-right">
              <StatusPill tone={runtimeVersionTone(health)}>
                {health?.version || "Unknown"}
              </StatusPill>
              <span className={runtimeModeLabelClass()}>
                {health?.runtimeMode || "No runtime mode"}
              </span>
            </div>
          </SettingsRow>
          <SettingsRow title="Sidecar owner">
            <StatusPill tone={runtimeOwnerTone(health)}>{runtimeOwnerLabel(health)}</StatusPill>
          </SettingsRow>
          <SettingsRow title="Runtime process">
            <p
              className="max-w-full break-all text-right font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]"
              title={runtimeProcessLabel(health)}
            >
              {runtimeProcessLabel(health)}
            </p>
          </SettingsRow>
        </div>
      </details>
    </SettingsSection>
  );
}

export function runtimeOwnerCompactLabel(health: HealthStatus | null): string {
  if (!health) return "Unknown";
  if (runtimeOwnerTone(health) === "success") return "Installed";
  return health.runtimeMode || "Mismatch";
}

export function runtimeBuildShaClass(): string {
  return "min-w-0 max-w-[min(12rem,100%)] truncate font-mono text-[11px] text-[rgb(var(--app-text-subtle))]";
}

export function runtimeModeLabelClass(): string {
  return "min-w-0 max-w-[min(18rem,100%)] truncate text-xs text-[rgb(var(--app-text-muted))]";
}
