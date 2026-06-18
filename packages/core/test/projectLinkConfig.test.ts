import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyProjectLinkConfigToProjectTemplate,
  readProjectLinkConfig,
  resolveProjectTemplateName,
} from "../src/projectLinkConfig.js";
import type { ProjectTemplate } from "../src/projectTemplates.js";

function tempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mergepilot-project-link-"));
  fs.mkdirSync(path.join(dir, ".mergepilot"), { recursive: true });
  return dir;
}

function baseProjectTemplate(): ProjectTemplate {
  return {
    name: "node-web",
    description: "",
    languages: [],
    build: { command: "npm run build" },
    test: { command: "npm test" },
    azure_devops: {
      organization: "",
      project: "",
      repository: "",
      default_target_branch: "main",
      pipeline_id: null,
    },
    ignored_globs: [],
  };
}

describe("project link config", () => {
  it("reads the current project-link config file", () => {
    const repo = tempRepo();
    fs.writeFileSync(
      path.join(repo, ".mergepilot", "project-link.yaml"),
      [
        "project_template: node-web",
        "azure_devops:",
        "  organization: https://dev.azure.com/contoso",
        "  project: demo",
        "  repository: demo-web",
        "  default_target_branch: develop",
        "  pipeline_id: 42",
        "",
      ].join("\n"),
      "utf8",
    );

    const config = readProjectLinkConfig(repo);
    expect(config?.projectTemplate).toBe("node-web");
    expect(config?.azureDevOps.repository).toBe("demo-web");
    expect(config?.azureDevOps.pipelineId).toBe(42);
  });

  it("overlays Azure DevOps fields onto a project template", () => {
    const repo = tempRepo();
    fs.writeFileSync(
      path.join(repo, ".mergepilot", "project-link.yaml"),
      "project_template: node-web\nazure_devops:\n  repository: demo-web\n  default_target_branch: release\n",
      "utf8",
    );

    const merged = applyProjectLinkConfigToProjectTemplate(baseProjectTemplate(), readProjectLinkConfig(repo));
    expect(merged.build.command).toBe("npm run build");
    expect(merged.azure_devops.repository).toBe("demo-web");
    expect(merged.azure_devops.default_target_branch).toBe("release");
  });

  it("ignores blank config fields when overlaying defaults", () => {
    const repo = tempRepo();
    fs.writeFileSync(
      path.join(repo, ".mergepilot", "project-link.yaml"),
      "project_template: node-web\nazure_devops:\n  organization: ''\n  repository: demo-web\n",
      "utf8",
    );
    const projectTemplate = {
      ...baseProjectTemplate(),
      azure_devops: {
        ...baseProjectTemplate().azure_devops,
        organization: "https://dev.azure.com/default",
      },
    };

    const merged = applyProjectLinkConfigToProjectTemplate(projectTemplate, readProjectLinkConfig(repo));
    expect(merged.azure_devops.organization).toBe("https://dev.azure.com/default");
    expect(merged.azure_devops.repository).toBe("demo-web");
  });

  it("resolves blank explicit project templates from repo-local config", () => {
    const repo = tempRepo();
    fs.writeFileSync(
      path.join(repo, ".mergepilot", "project-link.yaml"),
      "project_template: node-web\n",
      "utf8",
    );

    expect(resolveProjectTemplateName({
      projectTemplate: " ",
      config: readProjectLinkConfig(repo),
    })).toBe("node-web");
  });
});
