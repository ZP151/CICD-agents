import { ActionButton, StatusBadge } from "../../../components/workbench/WorkbenchPrimitives.js";
import type { EnvironmentHealthSnapshot, EnvironmentHealthState } from "./environmentHealth.js";

const HEALTH_TONE: Record<EnvironmentHealthState, string> = {
  not_configured: "bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]",
  checking: "bg-[rgb(var(--app-surface))] text-[rgb(var(--app-text-muted))] ring-[rgb(var(--app-border))]",
  ready: "bg-[rgb(var(--app-success)_/_0.10)] text-[rgb(var(--app-success))] ring-[rgb(var(--app-success))]/35",
  degraded: "bg-[rgb(var(--app-warning)_/_0.10)] text-[rgb(var(--app-warning))] ring-[rgb(var(--app-warning))]/35",
  blocked: "bg-[rgb(var(--app-danger)_/_0.10)] text-[rgb(var(--app-danger))] ring-[rgb(var(--app-danger))]/35",
};

const HEALTH_LABEL: Record<EnvironmentHealthState, string> = {
  not_configured: "Not configured",
  checking: "Checking",
  ready: "Ready",
  degraded: "Degraded",
  blocked: "Blocked",
};

/**
 * MP-007: one compact health line answering "what is the environment, is it
 * safe, what can I do next". Recoverable items carry a reason and a single
 * primary action instead of bare red text (RA-025..RA-028).
 */
export function EnvironmentHealthSummary({
  health,
  onRecheck,
}: {
  health: EnvironmentHealthSnapshot;
  onRecheck: () => void;
}): JSX.Element {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-raised))] px-2.5 py-1.5">
      <StatusBadge className={HEALTH_TONE[health.state]}>{HEALTH_LABEL[health.state]}</StatusBadge>
      <span className="min-w-0 flex-1 text-[11px] leading-4 text-[rgb(var(--app-text-muted))]">
        {health.reason}
      </span>
      {health.state !== "checking" && (
        <ActionButton
          type="button"
          tone="quiet"
          className="min-h-6 px-2 text-[11px]"
          onClick={onRecheck}
          aria-label={health.primaryAction}
        >
          {health.state === "ready" ? "Re-check" : health.primaryAction}
        </ActionButton>
      )}
    </div>
  );
}
