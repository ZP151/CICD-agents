export default function Repos(): JSX.Element {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Repos</h2>
      <p className="text-sm text-zinc-400">
        Repository mappings are managed from Project Links. For template defaults, edit
        <code className="mx-1 rounded bg-zinc-800 px-1 py-0.5 text-xs">
          packages/core/config/project-templates.yaml
        </code>
        or use <code>mergepilot init --project-template</code> from the CLI.
      </p>
    </div>
  );
}
