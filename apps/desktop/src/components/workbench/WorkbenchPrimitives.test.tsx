import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ActionLink,
  ActionButton,
  InlineNotice,
  StatusBadge,
  WorkbenchDisclosure,
  WorkbenchEmptyState,
  WorkbenchHeader,
  WorkbenchFilterTabs,
  WorkbenchListItemButton,
  WorkbenchPage,
  WorkbenchSegmentedControl,
  WorkbenchSettingsRow,
  WorkbenchSettingsSection,
  WorkbenchSkeleton,
  WorkbenchSidePanel,
  WorkbenchSelect,
  WorkbenchTextInput,
  WorkbenchTextArea,
  WorkbenchToggle,
  workbenchPageClass,
} from "./WorkbenchPrimitives.js";

describe("WorkbenchPrimitives", () => {
  it("provides a compact page and header vocabulary for every workspace route", () => {
    const html = renderToStaticMarkup(
      <WorkbenchPage>
        <WorkbenchHeader title="Pipelines" description="Inspect current run state." actions={<ActionButton>Refresh</ActionButton>}>
          <StatusBadge tone="success">Healthy</StatusBadge>
        </WorkbenchHeader>
      </WorkbenchPage>,
    );

    expect(workbenchPageClass()).toContain("max-w-[1600px]");
    expect(workbenchPageClass()).toContain("max-[1100px]");
    expect(html).toContain("Pipelines");
    expect(html).toContain("Refresh");
    expect(html).toContain("Healthy");
  });

  it("uses semantic action and notice states", () => {
    const html = renderToStaticMarkup(
      <>
        <ActionButton tone="danger" loading>Delete</ActionButton>
        <ActionLink href="#/project-links" tone="primary">Open Project Links</ActionLink>
        <InlineNotice tone="warning" title="Refresh delayed">Try again when the connection returns.</InlineNotice>
        <WorkbenchEmptyState title="No pull requests" description="Choose a Project Link to begin." />
        <WorkbenchSkeleton rows={1} />
      </>,
    );

    expect(html).toContain("Delete");
    expect(html).toContain('href="#/project-links"');
    expect(html).toContain("Open Project Links");
    expect(html).toContain("disabled");
    expect(html).toContain("Refresh delayed");
    expect(html).toContain("No pull requests");
    expect(html).toContain("workbench-loading-indicator");
    expect(html).toContain("workbench-skeleton-block");
  });

  it("uses one compact, labelled filter control across worklists", () => {
    const html = renderToStaticMarkup(
      <WorkbenchFilterTabs
        ariaLabel="Pipeline status filters"
        options={[
          { value: "all", label: "All", count: 7 },
          { value: "failed", label: "Failed", count: 2 },
        ]}
        value="failed"
        onValueChange={() => undefined}
      />,
    );

    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Pipeline status filters"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(">Failed</span><span");
    expect(html).toContain("focus-visible:ring");
  });

  it("uses a shared selected-list treatment for drill-in worklists", () => {
    const html = renderToStaticMarkup(
      <>
        <WorkbenchListItemButton selected onClick={() => undefined}>Review #42</WorkbenchListItemButton>
        <WorkbenchListItemButton onClick={() => undefined}>Review #43</WorkbenchListItemButton>
      </>,
    );

    expect(html).toContain('aria-current="true"');
    expect(html).toContain('data-state="selected"');
    expect(html).toContain("focus-visible:ring-[rgb(var(--app-focus))]/45");
    expect(html).toContain("hover:bg-[rgb(var(--app-surface-raised))]");
  });

  it("keeps optional technical detail low-chrome and keyboard accessible", () => {
    const html = renderToStaticMarkup(
      <WorkbenchDisclosure>ado_project_link_incomplete</WorkbenchDisclosure>,
    );

    expect(html).toContain("<details");
    expect(html).toContain("Technical detail");
    expect(html).toContain("ado_project_link_incomplete");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).not.toContain("rounded-lg border");
  });

  it("provides shared form controls with visible selected, focus, and disabled states", () => {
    const html = renderToStaticMarkup(
      <>
        <WorkbenchTextInput aria-label="Endpoint" placeholder="https://example.test" />
        <WorkbenchTextArea aria-label="Change request" />
        <WorkbenchSelect aria-label="Project" defaultValue="mergepilot">
          <option value="mergepilot">MergePilot</option>
        </WorkbenchSelect>
        <WorkbenchSegmentedControl
          ariaLabel="Provider"
          options={[{ value: "azure", label: "Azure" }, { value: "openai", label: "OpenAI" }]}
          value="azure"
          onValueChange={() => undefined}
        />
        <WorkbenchToggle ariaLabel="Enable model" checked disabled onChange={() => undefined} />
      </>,
    );

    expect(html).toContain('aria-label="Endpoint"');
    expect(html).toContain('aria-label="Change request"');
    expect(html).toContain('aria-label="Project"');
    expect(html).toContain('aria-label="Provider"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain("focus:ring");
    expect(html).toContain("disabled");
    expect(html).toContain("min-h-9");
  });

  it("provides responsive setting rows without a page-specific form vocabulary", () => {
    const html = renderToStaticMarkup(
      <WorkbenchSettingsSection title="Runtime">
        <WorkbenchSettingsRow title="Daemon" description="Local process status.">
          <StatusBadge tone="success">Healthy</StatusBadge>
        </WorkbenchSettingsRow>
      </WorkbenchSettingsSection>,
    );

    expect(html).toContain("Runtime");
    expect(html).toContain("Local process status.");
    expect(html).toContain("divide-y");
    expect(html).toContain("min-[761px]:grid-cols");
    expect(html).toContain("max-[760px]:grid-cols-1");
  });

  it("provides a labelled details panel for route-level evidence", () => {
    const html = renderToStaticMarkup(
      <WorkbenchSidePanel open onOpenChange={() => undefined} title="Review details" description="PR #42">
        Stored evidence
      </WorkbenchSidePanel>,
    );

    expect(html).toContain('aria-label="Review details"');
    expect(html).toContain("PR #42");
    expect(html).toContain("Stored evidence");
  });
});
