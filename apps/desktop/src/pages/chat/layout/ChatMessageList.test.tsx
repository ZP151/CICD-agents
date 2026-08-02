import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectLink } from "../../../api.js";
import { groupChatRenderItems } from "../../../chatRenderItems.js";
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
      renderItems={groupChatRenderItems(bubbles)}
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

  it("renders a completed transcript and response copy/time controls", () => {
    const html = renderMessages([
      {
        id: "activity",
        kind: "system",
        text: "Worked for 23s",
        turnId: "turn-1",
        turnTranscript: {
          startedAt: 1_700_000_000_000,
          status: "completed",
          executionSealed: true,
          elapsedMs: 23_000,
          blocks: [],
          pendingGroups: {},
        },
      },
      {
        id: "assistant",
        kind: "assistant",
        text: "The review is complete.",
        meta: { timestamp: 1_700_000_023_000 },
      },
    ]);

    expect(html).toContain("Worked for 23s");
    expect(html).toContain("Copy response");
    expect(html).toContain("Copy");
    expect(html).toContain("<time");
    expect(html).not.toContain("Turn completed in");
  });

  it("withholds the response footer while a final is still streaming", () => {
    const html = renderMessages([{
      id: "assistant-streaming",
      kind: "assistant",
      text: "The conclusion is still arriving.",
      streaming: true,
      meta: { timestamp: 1_700_000_023_000 },
    }]);

    expect(html).not.toContain("Copy response");
    expect(html).not.toContain("<time");
  });

  it("renders only the canonical activity stack for a working Turn", () => {
    const html = renderMessages([
      {
        id: "turn",
        kind: "system",
        text: "Working",
        turnId: "turn-1",
        turnTranscript: {
          startedAt: Date.now(),
          status: "working",
          executionSealed: false,
          blocks: [
            { kind: "statement", id: "opening", source: "server", text: "Checking the branch before I run the read-only status command." },
            {
              kind: "tool_group",
              id: "group-1",
              label: "Ran commands",
              commands: [{
                id: "command-1",
                name: "git_status",
                command: "git status --short",
                status: "succeeded",
                summary: "stdout-secret-must-not-render",
              }],
            },
          ],
          pendingGroups: {},
        },
      },
    ]);

    expect(html).toContain("Working for 0s");
    expect(html).toContain("Checking the branch before I run the read-only status command.");
    expect(html).toContain("Ran commands");
    expect(html).not.toContain("Command groups");
    expect(html).not.toContain("stdout-secret-must-not-render");
  });

  it("renders a complete two-sentence action narrative before its real command group", () => {
    const narrative = "Check the selected Project Link’s active branch, working-tree state, and latest commit so the response is grounded in the target repository rather than a guessed workspace state. Those facts establish whether local changes affect the branch summary before the agent reports the result.";
    const html = renderMessages([{
      id: "turn",
      kind: "system",
      text: "Working",
      turnId: "turn-natural-narrative",
      turnTranscript: {
        startedAt: Date.now(),
        status: "working",
        executionSealed: false,
        blocks: [
          { kind: "statement", id: "inspect", source: "server", text: narrative },
          {
            kind: "tool_group",
            id: "inspect",
            label: "Ran commands",
            commands: [
              { id: "branch", name: "git_branch", command: "git branch --show-current", status: "succeeded", durationMs: 120 },
              { id: "status", name: "git_status", command: "git status --short", status: "succeeded", durationMs: 160 },
              { id: "head", name: "git_log", command: "git log -1 --format=%h", status: "succeeded", durationMs: 110 },
            ],
          },
        ],
        pendingGroups: {},
      },
    }]);

    expect(html).toContain(narrative);
    expect(html).not.toContain("…");
    expect(html).toContain("Ran commands");
    // Command rows stay collapsed until the user opens the actual group, so
    // the pre-action narrative remains the readable first item in the stack.
    expect(html).not.toContain("git branch --show-current");
  });

  it("identifies an MCP-backed command group without changing the activity hierarchy", () => {
    const html = renderMessages([{
      id: "mcp-turn",
      kind: "system",
      text: "Working",
      turnId: "turn-mcp",
      turnTranscript: {
        startedAt: Date.now(),
        status: "working",
        executionSealed: false,
        blocks: [{
          kind: "tool_group",
          id: "github-search",
          label: "Ran commands",
          connector: { kind: "mcp", id: "github", label: "GitHub" },
          commands: [{ id: "search", name: "mcp_github_search", command: "Search open issues", status: "succeeded" }],
        }],
        pendingGroups: {},
      },
    }]);

    expect(html).toContain("Ran commands");
    expect(html).toContain("GitHub");
    expect(html).toContain("MCP connector: GitHub");
    expect(html).not.toContain("Search open issues");
  });

  it("does not give an empty optimistic Turn a misleading disclosure control", () => {
    const html = renderMessages([{
      id: "empty-turn",
      kind: "system",
      text: "Working",
      turnId: "turn-1",
      turnTranscript: {
        startedAt: Date.now(),
        status: "working",
        executionSealed: false,
        blocks: [],
        pendingGroups: {},
      },
    }]);

    expect(html).toContain("Working for 0s");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("Ran commands");
  });

  it("keeps a no-tool Turn as one sealed Working lifecycle before its external final", () => {
    const html = renderMessages([
      {
        id: "turn",
        kind: "system",
        text: "Worked",
        turnId: "turn-no-tools",
        turnTranscript: {
          startedAt: 1_700_000_000_000,
          elapsedMs: 2_000,
          status: "completed",
          executionSealed: true,
          blocks: [{ kind: "statement", id: "opening", source: "server", text: "I will answer this directly without a repository check." }],
          pendingGroups: {},
        },
      },
      { id: "final", kind: "assistant", text: "Here is the direct answer.", meta: { timestamp: 1_700_000_002_000 } },
    ]);

    expect(html).toContain("Worked for 2s");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Ran commands");
    expect(html).toContain("Here is the direct answer.");
    expect(html).toContain("Copy response");
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

  it("keeps a pending approval compact and never repeats its long model explanation in Working", () => {
    const html = renderMessages([
      {
        id: "turn",
        kind: "system",
        text: "Working",
        turnId: "turn-1",
        turnTranscript: {
          startedAt: Date.now(),
          status: "working",
          executionSealed: false,
          blocks: [{
            kind: "approval",
            id: "approval-1",
            status: "waiting",
            text: "A long model explanation that must not be repeated inside the activity stream.",
          }],
          pendingGroups: {},
        },
      },
      {
        id: "approval",
        kind: "pending_confirm",
        turnId: "turn-1",
        pendingTool: "git_create_branch",
        pendingArgs: { name: "feature/config-updates" },
        pendingDescription: "Create branch feature/config-updates",
        pendingStatus: "waiting",
        riskLevel: "medium",
      },
    ]);

    expect(html).toContain("Create branch feature/config-updates");
    expect(html).not.toContain("A long model explanation that must not be repeated");
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

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
    expect(html).toContain("Suggested prompt drafts");
    expect(html).toContain("prompt-particle-deck");
    expect(html).not.toContain("animate-pulse");
  });

  it("keeps the New Chat home visible but disabled while Project Links are resolving", () => {
    const html = renderMessages([], {
      availableProjectLinks: [],
      projectLinksLoading: true,
      activeProjectLinkId: null,
    });

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
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

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
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

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
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

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
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

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
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

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
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

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
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

    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Understand this project");
    expect(html).not.toContain("Would you like me to stage");
    expect(html).not.toContain("Run unit tests");
  });
});
