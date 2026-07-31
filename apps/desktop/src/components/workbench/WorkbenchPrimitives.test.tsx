import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ActionButton,
  InlineNotice,
  StatusBadge,
  WorkbenchEmptyState,
  WorkbenchHeader,
  WorkbenchPage,
  WorkbenchSkeleton,
  WorkbenchSidePanel,
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
        <InlineNotice tone="warning" title="Refresh delayed">Try again when the connection returns.</InlineNotice>
        <WorkbenchEmptyState title="No pull requests" description="Choose a Project Link to begin." />
        <WorkbenchSkeleton rows={1} />
      </>,
    );

    expect(html).toContain("Delete");
    expect(html).toContain("disabled");
    expect(html).toContain("Refresh delayed");
    expect(html).toContain("No pull requests");
    expect(html).toContain("workbench-loading-indicator");
    expect(html).toContain("workbench-skeleton-block");
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
