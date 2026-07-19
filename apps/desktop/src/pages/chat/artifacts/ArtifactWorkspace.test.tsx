import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ConversationArtifactPart,
  ConversationSourcePart,
} from "../../../chatBubbles.js";
import { ArtifactWorkspaceShell } from "./ArtifactWorkspace.js";
import { ArtifactWorkspaceContent } from "./ArtifactWorkspaceContent.js";
import {
  CodeSidePanel,
  sourceLineStartOffset,
  sourceWorkspaceTabClass,
  sourceWorkspaceTabsListClass,
} from "./SourceWorkspace.js";
import {
  sourceCodeViewportEditorClass,
  sourceCodeViewportHeaderClass,
  sourceCodeViewportShellClass,
} from "./SourceCodeViewport.js";
import { sourcePreviewEmptyClass } from "./SourcePreviewEmpty.js";

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

const sourceTabs: ConversationSourcePart[] = [
  {
    type: "source_document",
    sourceId: "source-1",
    title: "src/index.ts",
    file: "src/index.ts",
  },
  {
    type: "source_document",
    sourceId: "source-2",
    title: "README.md",
    file: "README.md",
  },
];

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

  it("renders selected artifact shell with lazy content fallback", () => {
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
    expect(html).toContain("Loading result preview");
  });

  it("renders selected markdown artifact content and actions", () => {
    const html = renderToStaticMarkup(
      <ArtifactWorkspaceContent
        artifact={markdownArtifact}
        lookupState={null}
      />,
    );

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

  it("renders source workspace tab controls", () => {
    const html = renderToStaticMarkup(
      <CodeSidePanel
        repoPath="C:\\repo"
        source={null}
        sources={sourceTabs}
        artifact={null}
        artifactLookupState={null}
        artifactCount={0}
        onSourceSelect={() => undefined}
        onSourceClose={() => undefined}
        onClearSources={() => undefined}
        onClearArtifact={() => undefined}
      />,
    );

    expect(html).toContain("src/index.ts");
    expect(html).toContain("README.md");
    expect(html).toContain("Close all files");
    expect(html).toContain("Clear");
    expect(html).toContain("No file selected");
  });

  it("keeps source tabs responsive inside narrow code panels", () => {
    expect(sourceWorkspaceTabsListClass()).toContain("min-w-0");
    expect(sourceWorkspaceTabsListClass()).toContain("overflow-x-auto");
    expect(sourceWorkspaceTabClass()).toContain("max-w-[min(14rem,60vw)]");
    expect(sourceWorkspaceTabClass()).not.toContain("max-w-[14rem]");
  });

  it("keeps the source code preview chrome responsive", () => {
    expect(sourceCodeViewportShellClass()).toContain("min-w-0");
    expect(sourceCodeViewportHeaderClass()).toContain("flex-wrap");
    expect(sourceCodeViewportEditorClass()).toContain("min-w-0");
    expect(sourcePreviewEmptyClass()).toContain("min-w-0");
  });

  it("converts source line numbers to CodeMirror document offsets", () => {
    expect(sourceLineStartOffset("alpha\nbeta\ngamma", 1)).toBe(0);
    expect(sourceLineStartOffset("alpha\nbeta\ngamma", 2)).toBe(6);
    expect(sourceLineStartOffset("alpha\r\nbeta\r\ngamma", 3)).toBe(13);
    expect(sourceLineStartOffset("alpha\nbeta\ngamma", 4)).toBeNull();
    expect(sourceLineStartOffset("alpha\nbeta\ngamma", 0)).toBeNull();
    expect(sourceLineStartOffset("alpha\nbeta\ngamma", undefined)).toBeNull();
  });
});
