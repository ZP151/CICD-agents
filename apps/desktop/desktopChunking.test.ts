import { describe, expect, it } from "vitest";
import { desktopManualChunk, resolveBuildSha } from "./vite.config.js";

describe("desktopManualChunk", () => {
  it("keeps the assistant runtime behind the lazily loaded Chat route", () => {
    expect(
      desktopManualChunk("C:/workspace/node_modules/@assistant-ui/react/dist/index.js"),
    ).toBe("vendor-assistant-ui");
  });

  it("keeps shared desktop dependencies in their established chunks", () => {
    expect(desktopManualChunk("C:/workspace/node_modules/react/index.js")).toBe("vendor-react");
    expect(desktopManualChunk("C:/workspace/node_modules/@uiw/react-codemirror/esm/index.js")).toBe("vendor-codemirror");
  });
});

describe("resolveBuildSha", () => {
  it("prefers the explicit MergePilot provenance SHA", () => {
    expect(resolveBuildSha(
      { MERGEPILOT_BUILD_SHA: "candidate-sha", GITHUB_SHA: "github-sha" },
      () => "git-sha",
    )).toBe("candidate-sha");
  });

  it("uses the full Git HEAD when no build environment SHA exists", () => {
    expect(resolveBuildSha({}, () => "0123456789abcdef0123456789abcdef01234567"))
      .toBe("0123456789abcdef0123456789abcdef01234567");
  });
});
