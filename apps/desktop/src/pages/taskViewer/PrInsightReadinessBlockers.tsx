import type { PrInsightArtifactRecord } from "../../api.js";
import { prInsightBlockerDetails } from "./prInsightActivity.js";

export function PrInsightReadinessBlockers({
  item,
}: {
  item: PrInsightArtifactRecord;
}): JSX.Element | null {
  const groups = prInsightBlockerDetails(item);
  if (groups.length === 0) return null;
  return (
    <section className="rounded-lg border border-zinc-800/70 bg-zinc-900/30 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-600">
        Readiness blockers
      </h3>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        {groups.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="text-xs text-zinc-600">{group.label}</p>
            <ul className="space-y-1">
              {group.values.map((value) => (
                <li key={value} className="break-words font-mono text-xs text-zinc-300">
                  {value}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
