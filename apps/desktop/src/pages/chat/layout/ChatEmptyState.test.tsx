import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChatEmptyState,
  chatEmptyStateShellClass,
  welcomeSuggestionsForProjectLink,
} from "./ChatEmptyState.js";
import type { ProjectLink } from "../../../api.js";

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

describe("ChatEmptyState", () => {
  it("uses a balanced maximized layout only for the ready new-chat welcome", () => {
    expect(chatEmptyStateShellClass(true)).toContain("justify-center");
    expect(chatEmptyStateShellClass(true)).toContain("py-8");
    expect(chatEmptyStateShellClass(true)).not.toContain("justify-start");
    expect(chatEmptyStateShellClass(false)).toContain("justify-center");
    expect(chatEmptyStateShellClass(false)).toContain("py-8");
    expect(chatEmptyStateShellClass(false)).not.toContain("pt-[18vh]");
  });

  it("shows context-derived welcome actions for an active Project Link empty conversation", () => {
    const html = renderToStaticMarkup(
      <ChatEmptyState
        repoPath={projectLink.repoPath}
        availableProjectLinks={[projectLink]}
        projectLinksLoading={false}
        activeProjectLinkId={projectLink.id}
        createProjectLink={async () => projectLink}
        selectProjectLink={() => undefined}
        onWelcomeSuggestion={() => undefined}
      />,
    );

    expect(html).toContain("New conversation welcome");
    expect(html).toContain("max-w-[58rem]");
    expect(html).toContain("prompt-particle-deck");
    expect(html).toContain('data-interaction="direct"');
    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Suggested prompt drafts");
    expect(html).toContain('aria-label="Suggested prompt drafts"');
    expect(html).toContain("Suggestions use the selected ClaimBot_API link context");
    expect(html).toContain("Edit the prompt before MergePilot does any work.");
    expect(html).toContain("Review ClaimBot_API changes");
    expect(html).toContain('aria-label="Use prompt: Review ClaimBot_API changes"');
    expect(html).toContain('data-suggestion-id="welcome-contextual-changes"');
    expect((html.match(/class="prompt-particle-deck__card"/g) ?? [])).toHaveLength(8);
    expect(html).toContain('aria-roledescription="prompt carousel"');
    expect(html).toContain('data-active="true"');
  });

  it("derives welcome actions from the selected Project Link and never offers a direct write workflow", () => {
    const suggestions = welcomeSuggestionsForProjectLink(projectLink);

    expect(suggestions).toHaveLength(8);
    expect(suggestions[0]).toMatchObject({ id: "welcome-contextual-changes", label: "Review ClaimBot_API changes" });
    expect(suggestions[1]).toMatchObject({ id: "welcome-contextual-branch", label: "Check main readiness" });
    expect(suggestions.map((suggestion) => suggestion.id)).toContain("welcome-contextual-tests");
    expect(suggestions.map((suggestion) => suggestion.id)).toContain("welcome-contextual-delivery");
    expect(suggestions.every((suggestion) => suggestion.action.kind === "fill_composer")).toBe(true);
    expect(suggestions.map((suggestion) => suggestion.label).join(" ")).not.toContain("Push and create PR");
    expect(welcomeSuggestionsForProjectLink(null)).toEqual([]);
  });

  it("keeps the home welcome stable while Project Links are loading", () => {
    const html = renderToStaticMarkup(
      <ChatEmptyState
        repoPath={projectLink.repoPath}
        availableProjectLinks={[]}
        projectLinksLoading={true}
        activeProjectLinkId={null}
        createProjectLink={async () => projectLink}
        selectProjectLink={() => undefined}
        onWelcomeSuggestion={() => undefined}
      />,
    );

    expect(html).toContain("New conversation welcome");
    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Checking Project Links...");
    expect(html).toContain("Connect or select a Project Link");
    expect(html).not.toContain("Suggested prompt drafts");
    expect(html).not.toContain("Loading Project Links");
    expect(html).not.toContain("Checking local workspace mappings");
    expect(html).not.toContain("Connect a Project Link to run workspace actions");
  });

  it("keeps the home welcome visible when no Project Link exists yet", () => {
    const html = renderToStaticMarkup(
      <ChatEmptyState
        repoPath={projectLink.repoPath}
        availableProjectLinks={[]}
        projectLinksLoading={false}
        activeProjectLinkId={null}
        createProjectLink={async () => projectLink}
        selectProjectLink={() => undefined}
        onWelcomeSuggestion={() => undefined}
      />,
    );

    expect(html).toContain("New conversation welcome");
    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Connect a project");
    expect(html).toContain("Link this repo to Azure DevOps.");
    expect(html).not.toContain("Connect a Project Link to run workspace actions");
    expect(html).not.toMatch(/>Create<\/span>/);
    expect(html).toContain("Create and use");
    expect(html).toContain("Connect or select a Project Link");
    expect(html).not.toContain("Suggested prompt drafts");
  });

  it("uses the searchable Project Link picker instead of expanding every configured link", () => {
    const secondLink = { ...projectLink, id: "pl-2", name: "A very long historical Project Link" };
    const html = renderToStaticMarkup(
      <ChatEmptyState
        repoPath={projectLink.repoPath}
        availableProjectLinks={[projectLink, secondLink]}
        projectLinksLoading={false}
        activeProjectLinkId={null}
        createProjectLink={async () => projectLink}
        selectProjectLink={() => undefined}
        onWelcomeSuggestion={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Workspace Project Link"');
    expect(html).not.toContain("A very long historical Project Link");
    expect(html).toContain("New Project Link");
  });
});
