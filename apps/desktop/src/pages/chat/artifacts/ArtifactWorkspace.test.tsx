import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ConversationArtifactPart } from "../../../chatBubbles.js";
import { ArtifactWorkspaceShell } from "./ArtifactWorkspace.js";
import { ArtifactWorkspaceContent } from "./ArtifactWorkspaceContent.js";

const markdownArtifact: ConversationArtifactPart = {
  type: "artifact",
  artifactId: "artifact-1",
  title: "PR insight",
  artifactType: "markdown",
  status: "ready",
  content: "# Review\n\nRisk: low",
};

const mermaidArtifact: ConversationArtifactPart = {
  type: "artifact",
  artifactId: "artifact-2",
  title: "Review flow",
  artifactType: "mermaid",
  status: "ready",
  content: "flowchart TD\n  A[Diff] --> B[Insight]",
};

describe("ArtifactWorkspace", () => {
  it("renders empty shell state with available artifact count", () => {
    const html = renderToStaticMarkup(
      <ArtifactWorkspaceShell
        artifact={null}
        lookupState={null}
        artifactCount={2}
        onClear={() => undefined}
      />,
    );

    expect(html).toContain("Result workspace");
    expect(html).toContain("2 available");
    expect(html).toContain("No artifact selected");
    expect(html).toContain("2 artifacts available in chat");
  });

  it("renders selected markdown artifact content and actions", () => {
    const html = renderToStaticMarkup(
      <ArtifactWorkspaceShell
        artifact={markdownArtifact}
        lookupState={null}
        artifactCount={1}
        onClear={() => undefined}
      />,
    );

    expect(html).toContain("PR insight");
    expect(html).toContain("artifact-1");
    expect(html).toContain("Markdown report");
    expect(html).toContain("Copy content");
    expect(html).toContain("Download");
    expect(html).toContain("Risk: low");
  });

  it("renders saved artifact lookup errors through the content Module", () => {
    const html = renderToStaticMarkup(
      <ArtifactWorkspaceContent
        artifact={{ ...markdownArtifact, content: "" }}
        lookupState={{ status: "error", message: "Artifact record was deleted." }}
      />,
    );

    expect(html).toContain("Saved artifact unavailable");
    expect(html).toContain("Artifact record was deleted.");
  });

  it("renders Mermaid artifacts without automatically rendering the diagram engine", () => {
    const html = renderToStaticMarkup(
      <ArtifactWorkspaceContent
        artifact={mermaidArtifact}
        lookupState={null}
      />,
    );

    expect(html).toContain("Mermaid diagram preview");
    expect(html).toContain("Render diagram");
    expect(html).toContain("flowchart TD");
    expect(html).not.toContain("mermaid-artifact-svg");
  });
});
