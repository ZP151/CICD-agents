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
      <h2 className="text-2xl font-semibold">Dashboard</h2>
      <section className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h3 className="mb-2 text-lg font-medium">Runtime</h3>
        {isLoading && <p>Loading...</p>}
        {error && <p className="text-red-400">runtime unreachable: {String(error)}</p>}
        {data && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
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
