import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../api.js";
import { InlineNotice, WorkbenchHeader, WorkbenchPage, WorkbenchSkeleton } from "../components/workbench/WorkbenchPrimitives.js";

export default function Dashboard(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  return (
    <WorkbenchPage>
      <WorkbenchHeader title="Dashboard" description="Local runtime health and service availability." />
      <section className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
        <h3 className="mb-2 text-lg font-medium text-[rgb(var(--app-text))]">Runtime</h3>
        {isLoading && <WorkbenchSkeleton rows={2} />}
        {error && <InlineNotice tone="danger" title="Runtime unreachable">{String(error)}</InlineNotice>}
        {data && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-[rgb(var(--app-text-muted))]">
            <dt>Status</dt>
            <dd>{data.ok ? "ok" : "not ready"}</dd>
            <dt>Uptime (s)</dt>
            <dd>{Math.round(data.uptimeSec ?? 0)}</dd>
            <dt>LLM configured</dt>
            <dd>{data.llmConfigured ? "yes" : "no"}</dd>
          </dl>
        )}
      </section>
    </WorkbenchPage>
  );
}
