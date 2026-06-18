import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const originalMergePilotDataDir = process.env.MERGEPILOT_DATA_DIR;

afterEach(() => {
  if (originalMergePilotDataDir === undefined) delete process.env.MERGEPILOT_DATA_DIR;
  else process.env.MERGEPILOT_DATA_DIR = originalMergePilotDataDir;
});

describe("loadConfig", () => {
  it("uses MERGEPILOT_DATA_DIR", () => {
    process.env.MERGEPILOT_DATA_DIR = "C:/mergepilot-data";

    expect(loadConfig().dataDir).toBe("C:/mergepilot-data");
  });
});
