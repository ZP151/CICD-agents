import { spawnSync } from "node:child_process";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";

/**
 * Well-known Git for Windows installation directories, in order of
 * preference. Shared by the startup probe and the runtime spawn recovery so a
 * broken or minimal PATH can never permanently disable the git tool surface.
 */
function gitCandidateDirs(): string[] {
  const home = nodeOs.homedir();
  const userProfile = process.env["USERPROFILE"] ?? "";
  return [
    "C:\\Program Files\\Git\\cmd",
    "C:\\Program Files\\Git\\bin",
    "C:\\Program Files (x86)\\Git\\cmd",
    nodePath.join(home, "AppData", "Local", "Programs", "Git", "cmd"),
    ...(userProfile ? [nodePath.join(userProfile, "AppData", "Local", "Programs", "Git", "cmd")] : []),
    "C:\\ProgramData\\scoop\\apps\\git\\current\\cmd",
    nodePath.join(home, "scoop", "apps", "git", "current", "cmd"),
  ];
}

/**
 * On Windows, inject git into process PATH so git tools work when the daemon
 * runs as a Tauri sidecar, which inherits a minimal PATH.
 */
export function injectGitPath(): void {
  if (process.platform !== "win32") return;
  const probe = spawnSync("git", ["--version"], { shell: false, encoding: "utf8", timeout: 3000 });
  if (probe.status === 0) return;
  ensureGitOnPath();
}

/**
 * Recovery for a spawn that just failed with ENOENT on Windows: prepend the
 * first existing known Git directory to process PATH without re-probing.
 * Only reachable after an actual spawn failure (or a failed startup probe),
 * so the probe cost is paid exactly once per process, not per command.
 * Idempotent: a candidate already present on PATH is never prepended again.
 */
export function ensureGitOnPath(): void {
  if (process.platform !== "win32") return;
  const currentPath = process.env["PATH"] ?? "";
  const found = gitCandidateDirs().find((p) => {
    try {
      return nodeFs.existsSync(p);
    } catch {
      return false;
    }
  });
  if (!found) return;
  const entries = currentPath.split(";").map((entry) => entry.trim().toLowerCase());
  if (entries.includes(found.toLowerCase())) return;
  process.env["PATH"] = `${found};${currentPath}`;
}
