import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectLink } from "../../../api.js";
import type { Bubble } from "../chat.types.js";
import { ChatMessageList } from "./ChatMessageList.js";

function renderMessages(
  bubbles: Bubble[],
  options: {
    availableProjectLinks?: ProjectLink[];
    projectLinksLoading?: boolean;
    activeProjectLinkId?: string | null;
  } = {},
): string {
  return renderToStaticMarkup(
    <ChatMessageList
      bubbles={bubbles}
      renderItems={bubbles.map((bubble) => ({ kind: "bubble", bubble }))}
      busy={false}
      statusText={null}
      repoPath="C:\\repo"
      availableProjectLinks={options.availableProjectLinks ?? []}
      projectLinksLoading={options.projectLinksLoading ?? false}
      activeProjectLinkId={options.activeProjectLinkId ?? null}
      selectedArtifactId={null}
      createProjectLink={async () => {
        throw new Error("unused");
      }}
      selectProjectLink={() => undefined}
      toggleTool={() => undefined}
      confirmPendingAction={() => undefined}
      cancelPendingAction={() => undefined}
      resolveConfirm={async () => undefined}
      selectArtifact={() => undefined}
      selectSource={() => undefined}
      openPrInsightSourceInActivity={() => undefined}
      openPrInsightSourceInWorkspace={() => undefined}
    />,
  );
}

describe("ChatMessageList", () => {
  it("renders current-turn image attachments as thumbnails instead of placeholder text", () => {
    const html = renderMessages([{
      id: "user-image",
      kind: "user",
      text: "What is in this screenshot?\n\n[image: composer-screenshot.png]",
      transientImageAttachments: [{
        id: "image-1",
        name: "composer-screenshot.png",
        mimeType: "image/png",
        size: 68,
        dataUrl: "data:image/png;base64,AAAA",
      }],
    }]);

    expect(html).toContain("What is in this screenshot?");
    expect(html).toContain("alt=\"composer-screenshot.png\"");
    expect(html).toContain("src=\"data:image/png;base64,AAAA\"");
    expect(html).not.toContain("[image: composer-screenshot.png]");
  });

  it("does not render completed pending approval cards", () => {
    const html = renderMessages([
      {
        id: "approval-done",
        kind: "pending_confirm",
        pendingTool: "git_push",
        pendingArgs: { branch: "main" },
        pendingStatus: "done",
        riskLevel: "medium",
      },
      {
        id: "approval-cancelled",
        kind: "pending_confirm",
        pendingTool: "git_commit",
        pendingArgs: { message: "test" },
        pendingStatus: "cancelled",
        riskLevel: "medium",
      },
    ]);

    expect(html).not.toContain("Approved action finished");
    expect(html).not.toContain("Action not run");
    expect(html).not.toContain("Approval required");
  });

  it("keeps legacy confirmation cards action-only without duplicated plan text", () => {
    const html = renderMessages([
      {
        id: "confirm-legacy",
        kind: "confirm",
        plan: "This detailed explanation is already rendered in the assistant response.",
        confirmed: null,
        riskLevel: "medium",
      },
    ]);

    expect(html).toContain("Approval required");
    expect(html).toContain("Yes, run this action");
    expect(html).toContain("No, don&#x27;t run it");
    expect(html).not.toContain("This detailed explanation is already rendered");
  });

  it("does not render welcome templates for an active Project Link empty chat", () => {
    const html = renderMessages([], {
      activeProjectLinkId: "pl-1",
      availableProjectLinks: [{
        id: "pl-1",
        name: "Project Link",
        repoPath: "C:\\repo",
        defaultBranch: "main",
        targetBranch: "main",
        adoOrgUrl: "https://dev.azure.com/example",
        adoProject: "Project",
        adoRepoName: "Repo",
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
        createdAt: 1,
        updatedAt: 1,
      }],
    });

    expect(html).toContain("Empty conversation");
    expect(html).not.toContain("Ask MergePilot anything");
    expect(html).not.toContain("Review my changes");
    expect(html).not.toContain("animate-pulse");
  });

  it("does not flash Project Link setup while links are still loading", () => {
    const html = renderMessages([], {
      availableProjectLinks: [],
      projectLinksLoading: true,
      activeProjectLinkId: null,
    });

    expect(html).toContain("Loading project links");
    expect(html).not.toContain("Ask MergePilot anything");
    expect(html).not.toContain("animate-pulse");
    expect(html).not.toContain("Create a Project Link");
  });
});
