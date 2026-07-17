import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ChatCheckpointActivity,
  PrInsightArtifactRecord,
  ProjectLink,
  TaskView,
} from "../../api.js";
import type { ReviewActivityItem } from "./activityTypes.js";
import { ActivitySidebar } from "./ActivitySidebar.js";
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
  repoPath: projectLink.repoPath,
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
  reviewActivity = [reviewEvent],
}: {
  reviewActivity?: ReviewActivityItem[];
} = {}) {
  return renderToStaticMarkup(
    <ActivitySidebar
      projectLinks={[projectLink]}
      tasks={[task]}
      selectedTaskId={task.id}
      loading={false}
      activeCount={0}
      error={null}
      checkpointActivity={[checkpoint]}
      checkpointLoading={false}
      selectedCheckpointId={checkpoint.id}
      prInsightActivity={[prInsight]}
      prInsightLoading={false}
      prInsightProjectLinkFilter="all"
      prInsightKindFilter={"all" satisfies PrInsightArtifactRecord["kind"] | "all"}
      prInsightHistoryMeta={new Map()}
      selectedPrInsightId={prInsight.id}
      reviewActivity={reviewActivity}
      reviewLoading={false}
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
  it("renders section filters with counts before the activity lists", () => {
    const html = renderActivitySidebar();

    expect(html).toContain("Activity sections");
    expect(html).toContain("All");
    expect(html).toContain("Runs");
    expect(html).toContain("Checkpoints");
    expect(html).toContain("PR Insights");
    expect(html).toContain("Reviews");
  });

  it("keeps all operational history sections visible by default", () => {
    const html = renderActivitySidebar();

    expect(html).toContain("Pipeline submission");
    expect(html).toContain("git_status");
    expect(html).toContain("Update pipeline");
    expect(html).toContain("Review completed");
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
    expect(html).not.toContain("fieldErrors");
  });
});
