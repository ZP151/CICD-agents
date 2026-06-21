import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Bubble } from "../chat.types.js";
import { ChatMessageList } from "./ChatMessageList.js";

function renderMessages(bubbles: Bubble[]): string {
  return renderToStaticMarkup(
    <ChatMessageList
      bubbles={bubbles}
      renderItems={bubbles.map((bubble) => ({ kind: "bubble", bubble }))}
      busy={false}
      statusText={null}
      repoPath="C:\\repo"
      availableProjectLinks={[]}
      activeProjectLinkId={null}
      selectedArtifactId={null}
      welcomeSuggestions={[]}
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
});
