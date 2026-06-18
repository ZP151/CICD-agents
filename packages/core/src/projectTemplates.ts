import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { z } from "zod";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BuildSpec = z.object({ command: z.string().default("") }).default({ command: "" });
const TestSpec = z.object({ command: z.string().default("") }).default({ command: "" });

const AzureDevOpsSpec = z
  .object({
    organization: z.string().default(""),
    project: z.string().default(""),
    repository: z.string().default(""),
    default_target_branch: z.string().default("main"),
    pipeline_id: z.number().int().nullable().default(null),
  })
  .default({});

const ProjectTemplateSchema = z.object({
  description: z.string().default(""),
  languages: z.array(z.string()).default([]),
  build: BuildSpec,
  test: TestSpec,
  azure_devops: AzureDevOpsSpec,
  ignored_globs: z.array(z.string()).default([]),
});

const ProjectTemplatesFile = z.object({
  project_templates: z.record(ProjectTemplateSchema).default({}),
});

/** Build/test/ADO defaults loaded from the YAML project template file. */
export type ProjectTemplate = z.infer<typeof ProjectTemplateSchema> & { name: string };

export const DEFAULT_PROJECT_TEMPLATES_PATH = path.resolve(
  __dirname,
  "../config/project-templates.yaml",
);

function resolvePath(override?: string): string {
  if (override && fs.existsSync(override)) return override;
  const envOverride = process.env.MERGEPILOT_PROJECT_TEMPLATES_PATH;
  if (envOverride && fs.existsSync(envOverride)) return envOverride;
  return DEFAULT_PROJECT_TEMPLATES_PATH;
}

const emptyProjectTemplate = (name: string): ProjectTemplate => ({
  name,
  description: "",
  languages: [],
  build: { command: "" },
  test: { command: "" },
  azure_devops: {
    organization: "",
    project: "",
    repository: "",
    default_target_branch: "main",
    pipeline_id: null,
  },
  ignored_globs: [],
});

/** Load all project templates from the YAML file. */
export function loadProjectTemplates(
  projectTemplatesPath?: string,
): Record<string, ProjectTemplate> {
  const target = resolvePath(projectTemplatesPath);
  if (!fs.existsSync(target)) {
    return { default: emptyProjectTemplate("default") };
  }
  const text = fs.readFileSync(target, "utf8");
  const raw = YAML.parse(text) ?? {};
  const parsed = ProjectTemplatesFile.parse(raw);
  const out: Record<string, ProjectTemplate> = {};
  for (const [name, template] of Object.entries(parsed.project_templates)) {
    out[name] = { name, ...template };
  }
  if (!out.default) out.default = emptyProjectTemplate("default");
  return out;
}

/** Get a single YAML project template by name. */
export function getProjectTemplate(name: string, projectTemplatesPath?: string): ProjectTemplate {
  const all = loadProjectTemplates(projectTemplatesPath);
  return all[name] ?? all.default ?? emptyProjectTemplate(name);
}
