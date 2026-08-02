import { describe, expect, it } from "vitest";
import { desktopManualChunk } from "./vite.config.js";

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
