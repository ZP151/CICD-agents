import { useQuery } from "@tanstack/react-query";
import type { HealthStatus } from "../api.js";
import { fetchHealth } from "../api.js";
import {
  ActionButton,
  InlineNotice,
  StatusBadge,
  WorkbenchHeader,
  WorkbenchPage,
  WorkbenchSkeleton,
} from "../components/workbench/WorkbenchPrimitives.js";

export function dashboardHealthSummary(data: HealthStatus): {
  label: string;
  tone: "success" | "warning";
  rows: Array<{ label: string; value: string }>;
} {
  return {
    label: data.ok ? "Runtime ready" : "Runtime needs attention",
    tone: data.ok ? "success" : "warning",
    rows: [
      { label: "Service", value: data.ok ? "Available" : "Not ready" },
      { label: "Uptime", value: data.uptimeSec ? `${Math.round(data.uptimeSec)} seconds` : "Just started" },
      { label: "Model access", value: data.llmConfigured ? "Configured" : "Needs setup" },
    ],
  };
}

export function DashboardRuntimeDetails({ data }: { data: HealthStatus }): JSX.Element {
  const summary = dashboardHealthSummary(data);
  return (
    <section aria-label="Runtime status" className="divide-y divide-[rgb(var(--app-border))] overflow-hidden rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]">
      {summary.rows.map((row) => (
        <div key={row.label} className="flex min-w-0 items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm text-[rgb(var(--app-text-muted))]">{row.label}</span>
          <span className="truncate text-sm font-medium text-[rgb(var(--app-text))]" title={row.value}>{row.value}</span>
        </div>
      ))}
    </section>
  );
}

export default function Dashboard(): JSX.Element {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  return (
    <WorkbenchPage>
      <WorkbenchHeader
        title="Dashboard"
        description="Check the desktop runtime before you start a connected workflow."
        actions={<ActionButton onClick={() => void refetch()} loading={isFetching}>Refresh</ActionButton>}
      >
        {data && <StatusBadge tone={dashboardHealthSummary(data).tone}>{dashboardHealthSummary(data).label}</StatusBadge>}
      </WorkbenchHeader>

      {isLoading && <WorkbenchSkeleton rows={3} />}
      {!isLoading && error && (
        <InlineNotice tone="danger" title="Runtime unavailable">
          MergePilot could not reach its local runtime. Refresh, then check Runtime details in Settings.
        </InlineNotice>
      )}
      {data && <DashboardRuntimeDetails data={data} />}
    </WorkbenchPage>
  );
}
