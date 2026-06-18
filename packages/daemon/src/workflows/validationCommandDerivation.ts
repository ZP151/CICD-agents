import nodeFs from "node:fs";
import nodePath from "node:path";
import type { ValidationKind } from "./validationPreflight.js";

export interface DerivedValidationCommand {
  command: string;
  sourceSummary: string;
  selectedScript: string;
  packageFilters: string[];
  packageRoots: string[];
}

interface ValidationPackageCandidate {
  packageRoot: string;
  relativePackageRoot: string;
  packageName: string;
  script: string;
}

export function deriveValidationCommand(
  repoPath: string,
  kind: ValidationKind,
  changedFiles: string[],
): DerivedValidationCommand | undefined {
  const packageRoots = Array.from(new Set(
    changedFiles
      .map((file) => nearestPackageRoot(repoPath, file))
      .filter((root): root is string => Boolean(root)),
  ));
  if (packageRoots.length === 0) return undefined;

  const rootHasPnpm = nodeFs.existsSync(nodePath.join(repoPath, "pnpm-workspace.yaml")) ||
    nodeFs.existsSync(nodePath.join(repoPath, "pnpm-lock.yaml"));
  const hasPnpmWrapper = nodeFs.existsSync(nodePath.join(repoPath, "scripts", "windows", "pnpm-project.ps1"));
  const candidates = packageRoots
    .map((packageRoot) => validationPackageCandidate(repoPath, kind, packageRoot))
    .filter((candidate): candidate is ValidationPackageCandidate => Boolean(candidate));
  if (candidates.length !== packageRoots.length) return undefined;
  if (candidates.length > 1) {
    const script = commonScriptName(candidates);
    const packageNames = candidates.map((candidate) => candidate.packageName).filter(Boolean);
    if (!script || packageNames.length !== candidates.length || !rootHasPnpm || !hasPnpmWrapper) return undefined;
    const filters = packageNames.flatMap((packageName) => ["--filter", packageName]);
    return {
      command: `.\\scripts\\windows\\pnpm-project.ps1 ${filters.join(" ")} ${script === "test" || script === "build" ? script : `run ${script}`}`,
      sourceSummary: `derived from ${candidates.length} changed packages using script ${script}`,
      selectedScript: script,
      packageFilters: packageNames,
      packageRoots: candidates.map((candidate) => candidate.relativePackageRoot),
    };
  }

  const candidate = candidates[0]!;
  const { packageRoot, relativePackageRoot, packageName, script } = candidate;

  if (packageRoot === repoPath) {
    if (hasPnpmWrapper) {
      return {
        command: `.\\scripts\\windows\\pnpm-project.ps1 ${script === "test" || script === "build" ? script : `run ${script}`}`,
        sourceSummary: `derived from root package.json script ${script}`,
        selectedScript: script,
        packageFilters: [],
        packageRoots: ["."],
      };
    }
    return {
      command: `npm run ${script}`,
      sourceSummary: `derived from root package.json script ${script}`,
      selectedScript: script,
      packageFilters: [],
      packageRoots: ["."],
    };
  }

  if (rootHasPnpm && packageName && hasPnpmWrapper) {
    return {
      command: `.\\scripts\\windows\\pnpm-project.ps1 --filter ${packageName} ${script === "test" || script === "build" ? script : `run ${script}`}`,
      sourceSummary: `derived from ${relativePackageRoot}/package.json script ${script}`,
      selectedScript: script,
      packageFilters: [packageName],
      packageRoots: [relativePackageRoot],
    };
  }

  return {
    command: `npm --prefix ${relativePackageRoot} run ${script}`,
    sourceSummary: `derived from ${relativePackageRoot}/package.json script ${script}`,
    selectedScript: script,
    packageFilters: [],
    packageRoots: [relativePackageRoot],
  };
}

function validationPackageCandidate(
  repoPath: string,
  kind: ValidationKind,
  packageRoot: string,
): ValidationPackageCandidate | undefined {
  const packageJson = readPackageJson(packageRoot);
  const scripts = packageJson?.scripts && typeof packageJson.scripts === "object"
    ? packageJson.scripts as Record<string, unknown>
    : {};
  const script = selectValidationScriptName(kind, scripts);
  if (!script) return undefined;
  const packageName = typeof packageJson?.name === "string" && packageJson.name.trim()
    ? packageJson.name.trim()
    : "";
  return {
    packageRoot,
    relativePackageRoot: normalizeRelativePath(nodePath.relative(repoPath, packageRoot)),
    packageName,
    script,
  };
}

function commonScriptName(candidates: ValidationPackageCandidate[]): string {
  const [first] = candidates;
  if (!first) return "";
  return candidates.every((candidate) => candidate.script === first.script) ? first.script : "";
}

function nearestPackageRoot(repoPath: string, changedFile: string): string | undefined {
  const absoluteFile = nodePath.resolve(repoPath, changedFile);
  let current = nodeFs.existsSync(absoluteFile) && nodeFs.statSync(absoluteFile).isDirectory()
    ? absoluteFile
    : nodePath.dirname(absoluteFile);
  const root = nodePath.resolve(repoPath);
  while (current.startsWith(root)) {
    if (nodeFs.existsSync(nodePath.join(current, "package.json"))) return current;
    if (current === root) break;
    current = nodePath.dirname(current);
  }
  return undefined;
}

function readPackageJson(packageRoot: string): Record<string, unknown> | undefined {
  try {
    const raw = nodeFs.readFileSync(nodePath.join(packageRoot, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function selectValidationScriptName(kind: ValidationKind, scripts: Record<string, unknown>): string {
  const candidates = kind === "build"
    ? ["build"]
    : ["test", "test:unit", "vitest"];
  return candidates.find((name) => typeof scripts[name] === "string" && String(scripts[name]).trim()) ?? "";
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/");
}
