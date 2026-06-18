import { describe, expect, it } from "vitest";
import {
  azureDevOpsTools,
  INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST,
} from "../src/ado/toolRegistry.js";

describe("Azure DevOps tool registry", () => {
  it("keeps pull request mutation tools registered in manifest order", () => {
    const toolNames = azureDevOpsTools().map((tool) => tool.name);
    const manifestNames = INTERNAL_AZURE_DEVOPS_TOOL_MANIFEST.map((tool) => tool.name);
    const mutationNames = [
      "ado_add_pull_request_reviewer",
      "ado_remove_pull_request_reviewer",
      "ado_add_pull_request_label",
      "ado_remove_pull_request_label",
      "ado_link_work_item",
    ];

    expect(toolNames.filter((name) => mutationNames.includes(name))).toEqual(mutationNames);
    for (const name of mutationNames) {
      expect(manifestNames).toContain(name);
    }
  });
});
