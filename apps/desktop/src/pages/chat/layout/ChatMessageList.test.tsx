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
    busy?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <ChatMessageList
      bubbles={bubbles}
      renderItems={bubbles.map((bubble) => ({ kind: "bubble", bubble }))}
      busy={options.busy ?? false}
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
      onWelcomeSuggestion={() => undefined}
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

  it("renders stable welcome actions for an active Project Link empty chat", () => {
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

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
    expect(html).toContain("Understand this project");
    expect(html).toContain("Push and create PR");
    expect(html).not.toContain("animate-pulse");
  });

  it("keeps the New Chat home visible but disabled while Project Links are resolving", () => {
    const html = renderMessages([], {
      availableProjectLinks: [],
      projectLinksLoading: true,
      activeProjectLinkId: null,
    });

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
    expect(html).toContain("Checking Project Links...");
    expect(html).toContain("Create a Project Link first");
    expect(html).toContain("disabled=\"\"");
    expect(html).not.toContain("Loading Project Links");
    expect(html).not.toContain("Connect a Project Link to run workspace actions");
  });

  it("keeps loading project setup disabled while runtime is busy", () => {
    const html = renderMessages([], {
      busy: true,
      availableProjectLinks: [],
      projectLinksLoading: true,
      activeProjectLinkId: null,
    });

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
    expect(html).toContain("Checking Project Links...");
    expect(html).toContain("Create a Project Link first");
    expect(html).toContain("disabled=\"\"");
    expect(html).not.toContain("Loading Project Links");
    expect(html).not.toContain("Connect a Project Link to run workspace actions");
  });

  it("shows the New Chat welcome when restored bubbles contain only hidden completed approvals", () => {
    const html = renderMessages([
      {
        id: "approval-done",
        kind: "pending_confirm",
        pendingTool: "git_add",
        pendingArgs: { pathspec: "-A" },
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
    ], {
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

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
    expect(html).not.toContain("Approved action finished");
    expect(html).not.toContain("Action not run");
  });

  it("shows the New Chat welcome when restored bubbles contain only technical system messages", () => {
    const html = renderMessages([
      {
        id: "restored",
        kind: "system",
        text: "Session restored",
      },
      {
        id: "empty-system",
        kind: "system",
        text: "  ",
      },
    ], {
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

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
    expect(html).not.toContain("Session restored");
  });

  it("shows the New Chat welcome when restored bubbles contain only blank user or error entries", () => {
    const html = renderMessages([
      {
        id: "blank-user",
        kind: "user",
        text: "  ",
      },
      {
        id: "blank-error",
        kind: "error",
        text: "",
      },
    ], {
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

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
  });

  it("shows the New Chat welcome when restored assistant metadata has no visible transcript content", () => {
    const html = renderMessages([
      {
        id: "assistant-meta-only",
        kind: "assistant",
        text: "",
        meta: {
          suggestions: [
            "Run unit tests to verify error handling changes.",
            "Repository context: semantic index used.",
          ],
        },
      },
    ], {
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

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
    expect(html).not.toContain("Run unit tests to verify error handling changes.");
    expect(html).not.toContain("Repository context: semantic index used.");
  });

  it("shows the New Chat welcome when restored assistant parts contain only hidden suggestions", () => {
    const html = renderMessages([
      {
        id: "assistant-hidden-part-only",
        kind: "assistant",
        text: "",
        parts: [
          {
            type: "suggested_reply",
            id: "run-tests",
            label: "Run tests",
            message: "Run unit tests",
          },
        ],
      },
    ], {
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

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
    expect(html).not.toContain("Run tests");
  });

  it("shows the New Chat welcome when restored assistant text cleans down to no transcript", () => {
    const html = renderMessages([
      {
        id: "assistant-action-question-only",
        kind: "assistant",
        text: [
          "Would you like me to stage these changes for a commit?",
          "",
          "› Run unit tests to verify error handling changes.",
        ].join("\n"),
      },
    ], {
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

    expect(html).toContain("Ask MergePilot anything");
    expect(html).toContain("Review my changes");
    expect(html).not.toContain("Would you like me to stage");
    expect(html).not.toContain("Run unit tests");
  });
});
