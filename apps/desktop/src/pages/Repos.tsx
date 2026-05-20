export default function Repos(): JSX.Element {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Repos</h2>
      <p className="text-sm text-zinc-400">
        Profile management UI ships in the next iteration; for now edit
        <code className="mx-1 rounded bg-zinc-800 px-1 py-0.5 text-xs">
          packages/core/config/profiles.yaml
        </code>
        or use <code>dev-agent init</code> from the CLI.
      </p>
    </div>
  );
}
