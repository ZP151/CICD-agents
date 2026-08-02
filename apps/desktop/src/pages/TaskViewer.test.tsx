import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PrInsightArtifactRecord } from "../api.js";
import {
  ActivityEmptyDetail,
  activityEmptyDetailContent,
  PrInsightReadinessBlockers,
  taskViewerDetailClass,
  taskViewerLayoutClass,
} from "./TaskViewer.js";
import { prInsightReadinessBlockersGridClass } from "./taskViewer/PrInsightReadinessBlockers.js";
import { defaultActivitySelection } from "./taskViewer/useTaskViewerRuntime.js";

function prInsightArtifact(
  overrides: Partial<PrInsightArtifactRecord> = {},
): PrInsightArtifactRecord {
  return {
    id: "project-link-1/demo/42/review_run/2026-06-13T00%3A00%3A00.000Z",
    projectLinkId: "project-link-1",
    repository: "demo",
    pullRequestId: 42,
    title: "Improve PR insight",
    kind: "review_run",
    at: "2026-06-13T00:00:00.000Z",
    summary: "Saved PR insight summary.",
    readiness: "blocked",
    risks: ["Failed CI"],
    tokensIn: 100,
    tokensOut: 30,
    ...overrides,
  };
}

describe("TaskViewer PR insight readiness blockers", () => {
  it("uses an auto-fit blocker grid so detail groups reflow with panel width", () => {
    const className = prInsightReadinessBlockersGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,14rem),1fr)");
    expect(className).not.toContain("sm:grid-cols-2");
  });

  it("renders structured build, policy, thread, and work item blocker details", () => {
    const html = renderToStaticMarkup(
      <PrInsightReadinessBlockers
        item={prInsightArtifact({
          signals: {
            fileCount: 4,
            threadCount: 1,
            failedBuildCount: 1,
            failedPolicyCount: 1,
            workItemCount: 1,
            buildBlockers: [
              {
                id: 77,
                buildNumber: "20260610.1",
                definitionName: "CI",
                status: "completed",
                result: "failed",
                url: "https://ado/build/77",
              },
            ],
            policyBlockers: [
              {
                id: "policy-1",
                name: "Minimum reviewers",
                typeName: "Reviewer policy",
                status: "failed",
                isBlocking: true,
              },
            ],
            activeThreads: [
              {
                id: 5,
                status: 1,
                author: "Ada",
                firstComment: "Needs tests",
              },
            ],
            linkedWorkItems: [
              {
                id: 123,
                type: "User Story",
                title: "Improve agent insight",
                state: "Active",
                url: "https://ado/workItems/123",
              },
            ],
          },
        })}
      />,
    );

    expect(html).toContain("Readiness blockers");
    expect(html).toContain("Build blockers");
    expect(html).toContain("#77 20260610.1 CI: failed");
    expect(html).toContain("Policy blockers");
    expect(html).toContain("Minimum reviewers: failed (blocking)");
    expect(html).toContain("Active threads");
    expect(html).toContain("#5 Ada: Needs tests");
    expect(html).toContain("Linked work items");
    expect(html).toContain("#123 User Story [Active]: Improve agent insight");
  });

  it("renders nothing when no structured blocker metadata is available", () => {
    expect(renderToStaticMarkup(<PrInsightReadinessBlockers item={prInsightArtifact()} />)).toBe(
      "",
    );
  });
});

describe("ActivityEmptyDetail", () => {
  it("uses a responsive activity workbench layout", () => {
    const className = taskViewerLayoutClass();

    expect(className).toContain("xl:flex-row");
    expect(className).not.toContain("lg:flex-row");
    expect(className).toContain("items-stretch");
    expect(className).not.toContain("ml-0");
    expect(className).not.toContain("mr-auto");

    const detailClass = taskViewerDetailClass();
    expect(detailClass).toContain("min-w-0");
    expect(detailClass).toContain("xl:basis-0");
    expect(detailClass).not.toContain("lg:basis-0");
    expect(detailClass).not.toContain("lg:max-w-[74rem]");
    expect(detailClass).not.toContain("xl:max-w-[74rem]");
  });

  it("uses the shared low-chrome empty state before an operation is selected", () => {
    const html = renderToStaticMarkup(<ActivityEmptyDetail />);

    expect(html).toContain("Select an operation");
    expect(html).toContain("inspect its result and recovery path");
    expect(html).toContain("border-dashed");
    expect(html).not.toContain(">Detail<");
    expect(html).not.toContain("No operation selected");
  });

  it("shows recovery guidance instead of repeating the source unavailable card", () => {
    const html = renderToStaticMarkup(
      <ActivityEmptyDetail activityCount={0} error="Failed to fetch" loading={false} />,
    );

    expect(html).toContain("Recovery needed");
    expect(html).toContain("Could not load activity");
    expect(html).toContain("account settings");
    expect(html).not.toContain("Select an operation");
  });

  it("explains an empty operational history without implying a missing selection", () => {
    expect(activityEmptyDetailContent({
      activityCount: 0,
      error: null,
      loading: false,
    })).toEqual({
      title: "No activity recorded",
      description: "Workspace actions will appear here after the agent performs work.",
    });
  });
});

describe("defaultActivitySelection", () => {
  it("selects the newest available operational event for the Activity detail panel", () => {
    expect(defaultActivitySelection({
      tasks: [{ id: "task-old", createdAt: Date.parse("2026-07-17T08:00:00.000Z") }],
      checkpoints: [{ id: "checkpoint-new", at: Date.parse("2026-07-17T10:00:00.000Z") }],
      prInsights: [{ id: "insight-mid", at: "2026-07-17T09:00:00.000Z" }],
      reviews: [{ id: "review-mid", at: "2026-07-17T09:30:00.000Z" }],
    })).toEqual({ kind: "checkpoint", id: "checkpoint-new" });
  });

  it("normalizes second-based task and checkpoint timestamps before comparing activity", () => {
    expect(defaultActivitySelection({
      tasks: [{ id: "task-new", createdAt: 1_786_005_000 }],
      checkpoints: [{ id: "checkpoint-old", at: 1_786_004_000 }],
      prInsights: [],
      reviews: [],
    })).toEqual({ kind: "task", id: "task-new" });
  });

  it("returns null when there is no valid activity to open", () => {
    expect(defaultActivitySelection({
      tasks: [],
      checkpoints: [{ id: "checkpoint-invalid", at: 0 }],
      prInsights: [{ id: "insight-invalid", at: "not a date" }],
      reviews: [],
    })).toBeNull();
  });
});
