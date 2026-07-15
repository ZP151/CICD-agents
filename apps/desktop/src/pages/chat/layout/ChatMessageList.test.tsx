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
    welcomeSuggestions?: string[];
    welcomeSuggestionsReady?: boolean;
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
      welcomeSuggestions={options.welcomeSuggestions ?? []}
      welcomeSuggestionsReady={options.welcomeSuggestionsReady ?? true}
      createProjectLink={async () => {
        throw new Error("unused");
      }}
      selectProjectLink={() => undefined}
      queuePrompt={() => undefined}
      runWorkspaceAction={() => undefined}
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

  it("holds welcome suggestions until project index status is resolved", () => {
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
      welcomeSuggestions: ["Review my changes"],
      welcomeSuggestionsReady: false,
    });

    expect(html).toContain("Ask MergePilot anything");
    expect(html).not.toContain("Review my changes");
    expect(html).toContain("animate-pulse");
  });

  it("does not flash Project Link setup while links are still loading", () => {
    const html = renderMessages([], {
      availableProjectLinks: [],
      projectLinksLoading: true,
      activeProjectLinkId: null,
      welcomeSuggestionsReady: false,
    });

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("animate-pulse");
    expect(html).not.toContain("Create a Project Link");
  });
});
