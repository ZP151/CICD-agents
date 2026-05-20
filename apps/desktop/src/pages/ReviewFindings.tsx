export default function ReviewFindings(): JSX.Element {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Review findings</h2>
      <p className="text-sm text-zinc-400">
        Live findings from the cloud Review Agent will appear here once the
        Phase 3 service is reachable from this machine. The data source is
        the same Table Storage account the agent writes to (configured via
        the Settings page).
      </p>
    </div>
  );
}
