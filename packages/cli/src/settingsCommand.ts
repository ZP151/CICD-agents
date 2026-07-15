import type { Command } from "commander";
import chalk from "chalk";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSettings } from "@mergepilot/core";

export function registerSettingsCommand(program: Command): void {
  program
    .command("settings")
    .description("Inspect or toggle local settings (telemetry, etc).")
    .option("--telemetry <on|off>", "enable or disable App Insights metrics")
    .action(async (opts: Record<string, unknown>) => {
      const settings = getSettings();
      const file = join(settings.dataDir, "settings.json");
      let saved: Record<string, unknown> = {};
      if (existsSync(file)) {
        try {
          saved = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
        } catch {
          saved = {};
        }
      }

      const tel = opts["telemetry"];
      if (tel === "on" || tel === "off") {
        saved["telemetryEnabled"] = tel === "on";
        writeFileSync(file, JSON.stringify(saved, null, 2), "utf8");
        // eslint-disable-next-line no-console
        console.log(chalk.green(`telemetry: ${tel}`));
        // eslint-disable-next-line no-console
        console.log(
          `Set TELEMETRY_ENABLED=${tel === "on" ? "1" : "0"} in your environment to apply at startup.`,
        );
        return;
      }

      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ file, saved, runtime: settings }, null, 2));
    });
}
