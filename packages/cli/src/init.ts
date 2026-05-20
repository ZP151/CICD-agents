import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

export type RepoKind = "python" | "dotnet" | "node" | "unknown";

export interface InitInput {
  repoPath: string;
  profile: string;
  organization?: string;
  project?: string;
  repository?: string;
  targetBranch?: string;
}

export interface InitResult {
  configPath: string;
  written: boolean;
  contents: string;
}

export function detectRepoKind(repoPath: string): RepoKind {
  if (anyMatching(repoPath, [".csproj", ".sln"])) return "dotnet";
  if (fs.existsSync(path.join(repoPath, "package.json"))) return "node";
  if (
    fs.existsSync(path.join(repoPath, "pyproject.toml")) ||
    fs.existsSync(path.join(repoPath, "requirements.txt")) ||
    fs.existsSync(path.join(repoPath, "setup.py"))
  ) {
    return "python";
  }
  return "unknown";
}

export function suggestProfileFor(kind: RepoKind): string {
  switch (kind) {
    case "python":
      return "python-api";
    case "dotnet":
      return "dotnet-api";
    case "node":
      return "node-web";
    default:
      return "default";
  }
}

function anyMatching(dir: string, suffixes: string[]): boolean {
  if (!fs.existsSync(dir)) return false;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.some(
    (e) => e.isFile() && suffixes.some((s) => e.name.toLowerCase().endsWith(s.toLowerCase())),
  );
}

export function writeProfileFile(input: InitInput): InitResult {
  const dir = path.join(input.repoPath, ".cicd-agent");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "profile.yaml");
  const doc = {
    profile: input.profile,
    azure_devops: {
      organization: input.organization ?? "",
      project: input.project ?? "",
      repository: input.repository ?? "",
      default_target_branch: input.targetBranch ?? "main",
    },
  };
  const contents = YAML.stringify(doc);
  fs.writeFileSync(file, contents, "utf8");
  return { configPath: file, written: true, contents };
}
