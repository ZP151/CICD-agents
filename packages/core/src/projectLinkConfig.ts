import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { ProjectTemplate } from "./projectTemplates.js";

const ProjectLinkConfigSchema = z.object({
  project_template: z.string().optional(),
  azure_devops: z.object({
    organization: z.string().optional(),
    project: z.string().optional(),
    repository: z.string().optional(),
    default_target_branch: z.string().optional(),
    pipeline_id: z.coerce.number().int().nullable().optional(),
  }).default({}),
}).default({});

export interface ProjectLinkConfig {
  path: string;
  projectTemplate: string;
  azureDevOps: {
    organization?: string;
    project?: string;
    repository?: string;
    defaultTargetBranch?: string;
    pipelineId?: number | null;
  };
}

function trimOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

export function projectLinkConfigPaths(repoPath: string): { current: string } {
  const dir = path.join(repoPath, ".mergepilot");
  return {
    current: path.join(dir, "project-link.yaml"),
  };
}

export function readProjectLinkConfig(repoPath: string): ProjectLinkConfig | null {
  const paths = projectLinkConfigPaths(repoPath);
  const file = fs.existsSync(paths.current) ? paths.current : "";
  if (!file) return null;

  const parsed = ProjectLinkConfigSchema.parse(YAML.parse(fs.readFileSync(file, "utf8")) ?? {});
  return {
    path: file,
    projectTemplate: trimOptional(parsed.project_template) ?? "",
    azureDevOps: {
      organization: trimOptional(parsed.azure_devops.organization),
      project: trimOptional(parsed.azure_devops.project),
      repository: trimOptional(parsed.azure_devops.repository),
      defaultTargetBranch: trimOptional(parsed.azure_devops.default_target_branch),
      pipelineId: parsed.azure_devops.pipeline_id,
    },
  };
}

export function resolveProjectTemplateName(args: {
  projectTemplate?: string;
  config?: ProjectLinkConfig | null;
  fallback?: string;
}): string {
  return trimOptional(args.projectTemplate)
    ?? trimOptional(args.config?.projectTemplate)
    ?? args.fallback
    ?? "default";
}

export function applyProjectLinkConfigToProjectTemplate(
  projectTemplate: ProjectTemplate,
  config: ProjectLinkConfig | null,
): ProjectTemplate {
  if (!config) return projectTemplate;
  return {
    ...projectTemplate,
    azure_devops: {
      ...projectTemplate.azure_devops,
      organization: config.azureDevOps.organization ?? projectTemplate.azure_devops.organization,
      project: config.azureDevOps.project ?? projectTemplate.azure_devops.project,
      repository: config.azureDevOps.repository ?? projectTemplate.azure_devops.repository,
      default_target_branch: config.azureDevOps.defaultTargetBranch ?? projectTemplate.azure_devops.default_target_branch,
      pipeline_id: config.azureDevOps.pipelineId ?? projectTemplate.azure_devops.pipeline_id,
    },
  };
}
