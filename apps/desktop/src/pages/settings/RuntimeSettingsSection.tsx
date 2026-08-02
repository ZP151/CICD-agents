import type { HealthStatus } from "../../api";
import { DESKTOP_BUILD_SHA, DESKTOP_VERSION } from "../../buildInfo.js";
import {
  StatusBadge,
  WorkbenchSettingsRow,
  WorkbenchSettingsSection,
} from "../../components/workbench/WorkbenchPrimitives.js";

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
    <WorkbenchSettingsSection title="System">
      <WorkbenchSettingsRow
        title="Runtime"
        description="Desktop, daemon, and ownership status."
      >
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          <StatusBadge tone="success">Desktop {DESKTOP_VERSION}</StatusBadge>
          <StatusBadge tone={runtimeVersionTone(health)}>
            Daemon {health?.version || "Unknown"}
          </StatusBadge>
          <StatusBadge tone={runtimeOwnerTone(health)}>{runtimeOwnerCompactLabel(health)}</StatusBadge>
        </div>
      </WorkbenchSettingsRow>
      <details className="settings-advanced">
        <summary>
          <span>Runtime details</span>
          <span className="settings-advanced-meta">{health?.runtimeMode || "Unknown"}</span>
        </summary>
        <div className="settings-advanced-list">
          <WorkbenchSettingsRow title="Desktop build">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-right">
              <StatusBadge tone="success">{DESKTOP_VERSION}</StatusBadge>
              {DESKTOP_BUILD_SHA && (
                <span className={runtimeBuildShaClass()}>
                  {DESKTOP_BUILD_SHA.slice(0, 12)}
                </span>
              )}
            </div>
          </WorkbenchSettingsRow>
          <WorkbenchSettingsRow title="Daemon runtime">
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-right">
              <StatusBadge tone={runtimeVersionTone(health)}>
                {health?.version || "Unknown"}
              </StatusBadge>
              <span className={runtimeModeLabelClass()}>
                {health?.runtimeMode || "No runtime mode"}
              </span>
            </div>
          </WorkbenchSettingsRow>
          <WorkbenchSettingsRow title="Sidecar owner">
            <StatusBadge tone={runtimeOwnerTone(health)}>{runtimeOwnerLabel(health)}</StatusBadge>
          </WorkbenchSettingsRow>
          <WorkbenchSettingsRow title="Runtime process">
            <p
              className="max-w-full break-all text-right font-mono text-[11px] leading-relaxed text-[rgb(var(--app-text-muted))]"
              title={runtimeProcessLabel(health)}
            >
              {runtimeProcessLabel(health)}
            </p>
          </WorkbenchSettingsRow>
        </div>
      </details>
    </WorkbenchSettingsSection>
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
