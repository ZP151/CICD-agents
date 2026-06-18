import { Command } from "commander";
import chalk from "chalk";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function registerSetupGlobalCommand(program: Command): void {
  program
    .command("setup-global")
    .description(
      "Write a global mergepilot wrapper to ~/.mergepilot/bin so it can be invoked from any directory.",
    )
    .option("--uninstall", "remove the global wrapper instead of creating it", false)
    .action(async (opts: Record<string, unknown>) => {
      const binDir = join(homedir(), ".mergepilot", "bin");
      const batPath = join(binDir, "mergepilot.bat");
      const ps1Path = join(binDir, "mergepilot.ps1");

      if (opts["uninstall"]) {
        [batPath, ps1Path].forEach((f) => {
          if (existsSync(f)) unlinkSync(f);
        });
        // eslint-disable-next-line no-console
        console.log(chalk.green("Removed global mergepilot wrappers."));
        // eslint-disable-next-line no-console
        console.log(chalk.dim(`You can also remove ${binDir} from your PATH.`));
        return;
      }

      const repoRoot = findGlobalRepoRoot();
      const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx.cmd");
      const entry = join(repoRoot, "packages", "cli", "src", "bin.ts");
      const distBin = join(repoRoot, "packages", "cli", "dist", "bin.js");
      const useNode = existsSync(distBin);
      const runner = useNode ? "node" : tsxBin;
      const script = useNode ? distBin : entry;

      mkdirSync(binDir, { recursive: true });
      writeFileSync(batPath, `@echo off\r\n"${runner}" "${script}" %*\r\n`, "utf8");
      writeFileSync(ps1Path, `& "${runner}" "${script}" @args\r\n`, "utf8");

      // eslint-disable-next-line no-console
      console.log(chalk.green("Global mergepilot wrapper written."));
      // eslint-disable-next-line no-console
      console.log(chalk.bold("\nTo finish setup, add this directory to your PATH:"));
      // eslint-disable-next-line no-console
      console.log(chalk.cyan(`  ${binDir}`));
      // eslint-disable-next-line no-console
      console.log(chalk.dim("\nPowerShell (run once):"));
      // eslint-disable-next-line no-console
      console.log(
        chalk.dim(
          `  [Environment]::SetEnvironmentVariable('PATH', $env:PATH + ';${binDir}', 'User')`,
        ),
      );
      // eslint-disable-next-line no-console
      console.log(chalk.dim("\nThen open a new terminal and run: mergepilot healthz"));
    });
}

function findGlobalRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
