import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../api.js";

export default function Dashboard(): JSX.Element {
  const { data, isLoading, error } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-[rgb(var(--app-text))]">Dashboard</h2>
      <section className="rounded border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] p-4">
        <h3 className="mb-2 text-lg font-medium text-[rgb(var(--app-text))]">Runtime</h3>
        {isLoading && <p className="text-[rgb(var(--app-text-muted))]">Loading...</p>}
        {error && <p className="text-[rgb(var(--app-danger))]">runtime unreachable: {String(error)}</p>}
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
    </div>
  );
}
