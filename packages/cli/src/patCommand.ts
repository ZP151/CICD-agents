import type { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "node:readline/promises";
import { PAT_KEYRING_SERVICE, PAT_KEYRING_USER } from "./cliRuntime.js";

export function registerConfigurePatCommand(program: Command): void {
  program
    .command("configure-pat")
    .description("Store the Azure DevOps PAT in the OS keyring.")
    .action(async () => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const pat = (await rl.question("Azure DevOps PAT: ")).trim();
      rl.close();
      if (!pat) {
        // eslint-disable-next-line no-console
        console.error(chalk.red("empty PAT, aborted."));
        process.exit(1);
      }

      const keytarMod = await import("keytar");
      const keytar = keytarMod.default ?? keytarMod;
      await keytar.setPassword(PAT_KEYRING_SERVICE, PAT_KEYRING_USER, pat);
      // eslint-disable-next-line no-console
      console.log(chalk.green(`stored PAT in OS keyring under service '${PAT_KEYRING_SERVICE}'.`));
    });
}
