import { spawnSync } from "node:child_process";
import nodeFs from "node:fs";
import nodeOs from "node:os";
import nodePath from "node:path";

/** On Windows, inject git into process PATH so git tools work when the
 *  daemon runs as a Tauri sidecar, which inherits a minimal PATH. */
export function injectGitPath(): void {
  if (process.platform !== "win32") return;
  const probe = spawnSync("git", ["--version"], { shell: false, encoding: "utf8", timeout: 3000 });
  if (probe.status === 0) return;

  const sep = ";";
  const currentPath = process.env["PATH"] ?? "";
  const home = nodeOs.homedir();
  const userProfile = process.env["USERPROFILE"] ?? "";
  const candidates = [
    "C:\\Program Files\\Git\\cmd",
    "C:\\Program Files\\Git\\bin",
    "C:\\Program Files (x86)\\Git\\cmd",
    nodePath.join(home, "AppData", "Local", "Programs", "Git", "cmd"),
    ...(userProfile ? [nodePath.join(userProfile, "AppData", "Local", "Programs", "Git", "cmd")] : []),
    "C:\\ProgramData\\scoop\\apps\\git\\current\\cmd",
    nodePath.join(home, "scoop", "apps", "git", "current", "cmd"),
  ];
  const found = candidates.find((p) => {
    try {
      return nodeFs.existsSync(p);
    } catch {
      return false;
    }
  });
  if (found) {
    process.env["PATH"] = `${found}${sep}${currentPath}`;
  }
}
