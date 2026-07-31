import { WorkbenchHeader, WorkbenchPage } from "../components/workbench/WorkbenchPrimitives.js";

export default function Repos(): JSX.Element {
  return (
    <WorkbenchPage>
      <WorkbenchHeader title="Repositories" description="Repository mappings and template defaults." />
      <p className="text-sm text-[rgb(var(--app-text-muted))]">
        Repository mappings are managed from Project Links. For template defaults, edit
        <code className="mx-1 rounded bg-[rgb(var(--app-bg-muted))] px-1 py-0.5 text-xs text-[rgb(var(--app-text))]">
          packages/core/config/project-templates.yaml
        </code>
        or use{" "}
        <code className="rounded bg-[rgb(var(--app-bg-muted))] px-1 py-0.5 text-xs text-[rgb(var(--app-text))]">
          mergepilot init --project-template
        </code>{" "}
        from the CLI.
      </p>
    </WorkbenchPage>
  );
}
