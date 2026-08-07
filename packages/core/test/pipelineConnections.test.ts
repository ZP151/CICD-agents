import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createPipelineConnection,
  listPipelineConnections,
  migrateLegacyPipelineFieldsToConnections,
} from "../src/pipelineConnections.js";

function tempDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-pipeline-connections-"));
}

describe("PipelineConnection migration (GAP-01)", () => {
  it("copies legacy Project Link pipeline fields into connections", () => {
    const dataDir = tempDataDir();
    const created = migrateLegacyPipelineFieldsToConnections(dataDir, [
      { id: "link-1", adoPipelineId: "117", adoPipelineName: "ClaimBot_API" },
      { id: "link-2", adoPipelineId: "42" },
      { id: "link-3" },
    ]);

    expect(created).toHaveLength(2);

    const first = created[0]!;
    const second = created[1]!;
    expect(first).toMatchObject({
      projectLinkId: "link-1",
      pipelineId: "117",
      pipelineName: "ClaimBot_API",
      purpose: "ci",
      isDefault: true,
    });
    expect(second).toMatchObject({
      projectLinkId: "link-2",
      pipelineId: "42",
      pipelineName: "Pipeline #42",
      isDefault: true,
    });

    // The link without a pipeline id is skipped entirely.
    expect(listPipelineConnections(dataDir, "link-3")).toHaveLength(0);
  });

  it("is idempotent: re-running never duplicates connections", () => {
    const dataDir = tempDataDir();
    migrateLegacyPipelineFieldsToConnections(dataDir, [
      { id: "link-1", adoPipelineId: "117", adoPipelineName: "ClaimBot_API" },
    ]);
    const secondRun = migrateLegacyPipelineFieldsToConnections(dataDir, [
      { id: "link-1", adoPipelineId: "117", adoPipelineName: "ClaimBot_API" },
    ]);

    expect(secondRun).toHaveLength(0);
    expect(listPipelineConnections(dataDir, "link-1")).toHaveLength(1);
  });

  it("marks only the first migrated connection for a link as default", () => {
    const dataDir = tempDataDir();
    migrateLegacyPipelineFieldsToConnections(dataDir, [
      { id: "link-1", adoPipelineId: "117", adoPipelineName: "ClaimBot_API" },
      { id: "link-1", adoPipelineId: "118", adoPipelineName: "Release" },
    ]);

    const connections = listPipelineConnections(dataDir, "link-1");
    expect(connections).toHaveLength(2);
    expect(connections.filter((connection) => connection.isDefault)).toHaveLength(1);
    expect(connections.find((connection) => connection.isDefault)?.pipelineId).toBe("117");
  });

  it("existing connections for the same pipeline are never overwritten", () => {
    const dataDir = tempDataDir();
    const existing = createPipelineConnection(dataDir, {
      projectLinkId: "link-1",
      pipelineId: "117",
      pipelineName: "Manual",
      purpose: "ci",
      isDefault: true,
    });
    const created = migrateLegacyPipelineFieldsToConnections(dataDir, [
      { id: "link-1", adoPipelineId: "117", adoPipelineName: "ClaimBot_API" },
    ]);

    expect(created).toHaveLength(0);
    expect(listPipelineConnections(dataDir, "link-1")[0]?.id).toBe(existing.id);
    expect(listPipelineConnections(dataDir, "link-1")[0]?.pipelineName).toBe("Manual");
  });
});
