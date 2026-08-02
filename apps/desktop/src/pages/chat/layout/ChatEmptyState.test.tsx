import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ChatEmptyState,
  chatEmptyStateShellClass,
  welcomeSuggestions,
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

  it("shows stable welcome actions for an active Project Link empty conversation", () => {
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
    expect(html).toContain("Start with a focused prompt");
    expect(html).toContain("Suggested prompt drafts");
    expect(html).toContain('aria-label="Suggested prompt drafts"');
    expect(html).toContain("Choose a starting point, then edit the prompt before MergePilot does any work.");
    expect(html).toContain("Understand this project");
    expect(html).toContain('title="Use this prompt"');
    expect(html).toContain('data-suggestion-id="welcome-understand"');
    expect(html).not.toContain("Click to edit this prompt");
    // Five cards are visually present; two transparent edge positions stay
    // mounted so a long inertial swipe can move through three cards without a
    // DOM handoff mid-flight.
    expect((html.match(/prompt-particle-deck__card/g) ?? [])).toHaveLength(7);
    expect((html.match(/data-depth="3"/g) ?? [])).toHaveLength(2);
    expect(html).not.toContain("prompt-particle-deck__glyph");
    expect(html).toContain('data-autoplay="true"');
    expect(html).not.toContain("animate-pulse");
  });

  it("treats every welcome action as a user prompt, never as a direct workflow command", () => {
    expect(welcomeSuggestions).toHaveLength(7);
    expect(welcomeSuggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "welcome-understand", message: "Understand this project" }),
      expect.objectContaining({ id: "welcome-review", message: "Review my changes" }),
    ]));
    expect(welcomeSuggestions.every((suggestion) => suggestion.action.kind === "fill_composer")).toBe(true);
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
    expect(html).toContain("Create a Project Link first");
    expect(html).toContain("disabled=\"\"");
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
    expect(html).toContain("Create a Project Link first");
    expect(html).toContain("disabled=\"\"");
  });
});
