import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CheckpointPreviewSection,
  checkpointPreviewMetricsGridClass,
} from "./CheckpointPreviewSection.js";

describe("CheckpointPreviewSection", () => {
  it("uses an auto-fit metrics grid so snapshot fields reflow with panel width", () => {
    const className = checkpointPreviewMetricsGridClass();

    expect(className).toContain("auto-fit");
    expect(className).toContain("minmax(min(100%,8.5rem),1fr)");
    expect(className).not.toContain("sm:grid-cols-3");
  });

  it("uses a specific snapshot status while loading", () => {
    const html = renderToStaticMarkup(
      <CheckpointPreviewSection preview={null} previewLoading={true} />,
    );

    expect(html).toContain("Checking snapshot");
    expect(html).toContain("Reading changed files and diff metadata");
    expect(html).not.toContain(">Loading<");
  });
});
