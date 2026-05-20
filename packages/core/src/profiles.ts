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

const ProfileSchema = z.object({
  description: z.string().default(""),
  languages: z.array(z.string()).default([]),
  build: BuildSpec,
  test: TestSpec,
  azure_devops: AzureDevOpsSpec,
  ignored_globs: z.array(z.string()).default([]),
});

const ProfilesFile = z.object({
  profiles: z.record(ProfileSchema).default({}),
});

export type Profile = z.infer<typeof ProfileSchema> & { name: string };

export const DEFAULT_PROFILES_PATH = path.resolve(__dirname, "../config/profiles.yaml");

function resolvePath(override?: string): string {
  if (override && fs.existsSync(override)) return override;
  const envOverride = process.env.CICD_AGENT_PROFILES_PATH;
  if (envOverride && fs.existsSync(envOverride)) return envOverride;
  return DEFAULT_PROFILES_PATH;
}

const emptyProfile = (name: string): Profile => ({
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

export function loadProfiles(profilesPath?: string): Record<string, Profile> {
  const target = resolvePath(profilesPath);
  if (!fs.existsSync(target)) {
    return { default: emptyProfile("default") };
  }
  const text = fs.readFileSync(target, "utf8");
  const raw = YAML.parse(text) ?? {};
  const parsed = ProfilesFile.parse(raw);
  const out: Record<string, Profile> = {};
  for (const [name, p] of Object.entries(parsed.profiles)) {
    out[name] = { name, ...p };
  }
  if (!out.default) out.default = emptyProfile("default");
  return out;
}

export function getProfile(name: string, profilesPath?: string): Profile {
  const all = loadProfiles(profilesPath);
  return all[name] ?? all.default ?? emptyProfile(name);
}
