import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ChatCheckpointActivity,
  PrInsightArtifactRecord,
  ProjectLink,
  TaskView,
} from "../../api.js";
import type { ReviewActivityItem } from "./activityTypes.js";
import {
  ActivitySidebar,
  ActivitySidebarLoadingState,
  ActivitySidebarUnavailableState,
  activityVisibleSections,
  activitySectionFilterGridClass,
  activitySidebarListClass,
  activitySidebarShellClass,
} from "./ActivitySidebar.js";
import type { PrInsightActivityItem } from "./prInsightActivity.js";

const projectLink: ProjectLink = {
  id: "pl-1",
  name: "ClaimBot_API link",
  createdAt: 1,
  updatedAt: 1,
  repoPath: "C:\\repos\\ClaimBot_API",
  defaultBranch: "main",
  targetBranch: "main",
  adoOrgUrl: "https://tebssg.visualstudio.com/",
  adoProject: "TeBS-ClaimBot",
  adoRepoName: "ClaimBot_API",
  adoPat: "",
  adoPipelineId: "",
  adoPipelineName: "",
  adoMcpEnabled: false,
  adoMcpCommand: "",
  adoMcpAuthentication: "",
  adoMcpDomains: "",
  projectTemplate: "",
  buildCommand: "",
  testCommand: "",
};

const task: TaskView = {
  id: "task-1",
  kind: "submit-pipeline",
  status: "succeeded",
  payload: { repoPath: projectLink.repoPath },
  steps: [],
  result: null,
  error: "",
  createdAt: 1_786_000_000,
  startedAt: 1_786_000_000,
  finishedAt: 1_786_000_030,
};

const checkpoint: ChatCheckpointActivity = {
  id: "checkpoint-1",
  sessionId: "chat-1",
  repoPath: "C:\\Users\\15492\\AppData\\Local\\Temp\\mergepilot-live-push-j2JDBp\\work",
  projectLinkId: projectLink.id,
  at: 1_786_000_000,
  toolName: "git_status",
  toolSummary: "Clean checkpoint",
  toolOk: true,
  checkpointId: "git-1",
  checkpointPath: "C:\\Users\\15492\\.mergepilot\\checkpoints\\git-1.json",
};

const prInsight: PrInsightActivityItem = {
  id: "insight-1",
  projectLinkId: projectLink.id,
  projectLinkName: projectLink.name,
  repoPath: projectLink.repoPath,
  repository: projectLink.adoRepoName,
  pullRequestId: 2670,
  title: "Update pipeline",
  kind: "insight_preview",
  at: "2026-07-07T02:16:32.000Z",
  summary: "Pipeline insight",
  readiness: "needs_attention",
  risks: [],
  tokensIn: 10,
  tokensOut: 5,
};

const reviewEvent: ReviewActivityItem = {
  id: "review-1",
  projectLinkId: projectLink.id,
  projectLinkName: projectLink.name,
  kind: "review_run",
  repository: projectLink.adoRepoName,
  pullRequestId: 2670,
  actor: "desktop-user",
  label: "Review completed",
  ok: true,
  details: "One warning remains",
  at: "2026-07-07T02:16:32.000Z",
};

function renderActivitySidebar({
  tasks = [task],
  checkpointActivity = [checkpoint],
  prInsightActivity = [prInsight],
  reviewActivity = [reviewEvent],
  loading = false,
  checkpointLoading = false,
  prInsightLoading = false,
  reviewLoading = false,
  error = null,
}: {
  tasks?: TaskView[];
  checkpointActivity?: ChatCheckpointActivity[];
  prInsightActivity?: PrInsightActivityItem[];
  reviewActivity?: ReviewActivityItem[];
  loading?: boolean;
  checkpointLoading?: boolean;
  prInsightLoading?: boolean;
  reviewLoading?: boolean;
  error?: string | null;
} = {}) {
  return renderToStaticMarkup(
    <ActivitySidebar
      projectLinks={[projectLink]}
      tasks={tasks}
      selectedTaskId={tasks[0]?.id ?? null}
      loading={loading}
      activeCount={0}
      error={error}
      checkpointActivity={checkpointActivity}
      checkpointLoading={checkpointLoading}
      selectedCheckpointId={checkpointActivity[0]?.id ?? null}
      prInsightActivity={prInsightActivity}
      prInsightLoading={prInsightLoading}
      prInsightProjectLinkFilter="all"
      prInsightKindFilter={"all" satisfies PrInsightArtifactRecord["kind"] | "all"}
      prInsightHistoryMeta={new Map()}
      selectedPrInsightId={prInsightActivity[0]?.id ?? null}
      reviewActivity={reviewActivity}
      reviewLoading={reviewLoading}
      reviewProjectLinkFilter="all"
      reviewKindFilter="all"
      selectedReviewId={reviewActivity[0]?.id ?? null}
      onRefreshAll={() => undefined}
      onSelectTask={() => undefined}
      onSelectCheckpoint={() => undefined}
      onSelectPrInsight={() => undefined}
      onSelectReview={() => undefined}
      onClearSelection={() => undefined}
      onPrInsightProjectLinkFilterChange={() => undefined}
      onPrInsightKindFilterChange={() => undefined}
      onReviewProjectLinkFilterChange={() => undefined}
      onReviewKindFilterChange={() => undefined}
    />,
  );
}

describe("ActivitySidebar", () => {
  it("uses a responsive shell instead of a permanently fixed-width rail", () => {
    const shellClass = activitySidebarShellClass();
    const listClass = activitySidebarListClass();

    expect(shellClass).toContain("w-full");
    expect(shellClass).toContain("xl:w-[clamp(16rem,24vw,21rem)]");
    expect(shellClass).toContain("border-b");
    expect(shellClass).toContain("xl:border-r");
    expect(shellClass).not.toContain("lg:w-[clamp(18rem,30vw,23rem)]");
    expect(shellClass).not.toContain("xl:w-[clamp(20rem,28vw,24rem)]");
    expect(shellClass).not.toContain("xl:w-[420px]");
    expect(listClass).toContain("max-h-[16rem]");
    expect(listClass).toContain("overflow-x-hidden");
    expect(listClass).toContain("lg:max-h-[18rem]");
    expect(listClass).toContain("xl:flex-1");
    expect(listClass).not.toContain("lg:flex-1");
  });

  it("renders section filters with counts before the activity lists", () => {
    const html = renderActivitySidebar();
    const className = activitySectionFilterGridClass();

    expect(className).toContain("flex-wrap");
    expect(className).toContain("items-center");
    expect(className).toContain("gap-1.5");
    expect(className).not.toContain("auto-fit");
    expect(className).not.toContain("grid-cols-2");
    expect(html).toContain("Activity sections");
    expect(html).toContain("title=\"All: 3\"");
    expect(html).toContain("title=\"Checkpoints: 0\"");
    expect(html).toContain("title=\"PR Insights: 1\"");
    expect(html).toContain("All");
    expect(html).toContain("Runs");
    expect(html).toContain("Git");
    expect(html).toContain("PR");
    expect(html).toContain("Reviews");
  });

  it("keeps saved activity visible while collapsing transient workspace history", () => {
    const html = renderActivitySidebar();

    expect(html).toContain("Pipeline submission");
    expect(html).toContain("Update pipeline");
    expect(html).toContain("Review completed");
    expect(html).toContain("Temporary history");
    expect(html).not.toContain("git_status");
    expect(html).not.toContain("...\\mergepilot-live-push-j2JDBp\\work");
  });

  it("hides empty sections from the default All view while keeping non-empty sources visible", () => {
    const html = renderActivitySidebar({
      tasks: [],
    });

    expect(html).toContain("Update pipeline");
    expect(html).toContain("Review completed");
    expect(html).toContain("Temporary history");
    expect(html).not.toContain("git_status");
    expect(html).not.toContain("No agent runs recorded yet.");
    expect(html).not.toContain("Pipeline submission");
  });

  it("shows a selected empty section even though All hides it", () => {
    expect(activityVisibleSections({
      sectionFilter: "all",
      runs: 0,
      checkpoints: 1,
      prInsights: 0,
      reviewOperations: 0,
      loading: false,
      checkpointLoading: false,
      prInsightLoading: false,
      reviewLoading: false,
    })).toEqual({
      runs: false,
      checkpoints: true,
      prInsights: false,
      reviewOperations: false,
    });

    expect(activityVisibleSections({
      sectionFilter: "runs",
      runs: 0,
      checkpoints: 1,
      prInsights: 0,
      reviewOperations: 0,
      loading: false,
      checkpointLoading: false,
      prInsightLoading: false,
      reviewLoading: false,
    })).toEqual({
      runs: true,
      checkpoints: false,
      prInsights: false,
      reviewOperations: false,
    });
  });

  it("uses one primary source-list scroll instead of nested section scroll regions", () => {
    const html = renderActivitySidebar();

    expect(activitySidebarListClass()).toContain("overflow-y-auto");
    expect(html).not.toContain("max-h-[220px]");
    expect(html).not.toContain("max-h-[260px]");
    expect(html).not.toContain("max-h-[320px]");
  });

  it("summarizes structured review-operation details in the list preview", () => {
    const html = renderActivitySidebar({
      reviewActivity: [{
        ...reviewEvent,
        details: JSON.stringify({
          error: {
            fieldErrors: {
              sessionId: ["Expected string, received null"],
            },
            formErrors: [],
          },
        }),
      }],
    });

    expect(html).toContain("sessionId: Expected string, received null");
    expect(html).toContain("fieldErrors");
    expect(html).not.toContain("fieldErrors</p>");
  });

  it("keeps review operation metric previews short while preserving full details in title", () => {
    const details =
      "readiness=needs_attention; risks=2; files=2; threads=6; failedBuilds=0; tokens=156/254; source=llm";
    const html = renderActivitySidebar({
      reviewActivity: [{
        ...reviewEvent,
        details,
      }],
    });

    expect(html).toContain("readiness=needs_attention; risks=2; files=2");
    expect(html).toContain(`title="${details}"`);
    expect(html).not.toContain("tokens=156/254; source=llm</p>");
  });

  it("replaces empty section lists with one source unavailable state when local activity cannot load", () => {
    const html = renderActivitySidebar({
      tasks: [],
      checkpointActivity: [],
      prInsightActivity: [],
      reviewActivity: [],
      error: "Failed to fetch",
    });

    expect(html).toContain("Sources unavailable");
    expect(html).toContain("Refresh activity, or check the desktop daemon and account session.");
    expect(html).not.toContain("Daemon activity API");
    expect(html).toContain("Refresh activity");
    expect(html).toContain("Open Settings");
    expect(html).toContain("Failed to fetch");
    expect(html).not.toContain("Activity sections");
    expect(html).not.toContain("No agent runs recorded yet");
    expect(html).not.toContain("No Git checkpoints yet");
    expect(html).not.toContain("No saved PR insights yet");
    expect(html).not.toContain("No review operations yet");
  });

  it("keeps cached activity visible when a refresh error arrives after records loaded", () => {
    const html = renderActivitySidebar({ error: "Failed to fetch" });

    expect(html).toContain("Failed to fetch");
    expect(html).toContain("Activity sections");
    expect(html).toContain("Pipeline submission");
    expect(html).not.toContain("Activity unavailable");
  });

  it("keeps loading placeholders instead of showing unavailable while sources are still loading", () => {
    const html = renderActivitySidebar({
      tasks: [],
      checkpointActivity: [],
      prInsightActivity: [],
      reviewActivity: [],
      loading: true,
      error: "Failed to fetch",
    });

    expect(html).toContain("Activity sections");
    expect(html).toContain("Checking activity sources");
    expect(html).toContain("Runs, checkpoints, PR insights, and reviews are loading.");
    expect(html).not.toContain("Activity unavailable");
    expect(html).not.toContain("No agent runs recorded yet");
    expect(html).not.toContain("No Git checkpoints yet");
  });
});

describe("ActivitySidebarLoadingState", () => {
  it("shows one calm first-load state instead of multiple empty source lists", () => {
    const html = renderToStaticMarkup(<ActivitySidebarLoadingState />);

    expect(html).toContain("Checking activity sources");
    expect(html).toContain("Runs, checkpoints, PR insights, and reviews are loading.");
    expect(html).toContain("animate-pulse");
  });
});

describe("ActivitySidebarUnavailableState", () => {
  it("explains recoverable activity-loading failures without raw section noise", () => {
    const html = renderToStaticMarkup(
      <ActivitySidebarUnavailableState error="Failed to fetch" onRefresh={() => undefined} />,
    );

    expect(html).toContain("Sources unavailable");
    expect(html).toContain("the desktop daemon and account session");
    expect(html).not.toContain("Local data folder");
    expect(html).toContain("Refresh activity");
    expect(html).toContain("href=\"#/settings\"");
    expect(html).toContain("Failed to fetch");
  });
});
