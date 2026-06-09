import type { Environment } from "../providers/types.js";
import { createFsTools, type CreateFsToolsOptions } from "./create-fs-tools.js";
import { createBashTool } from "./create-bash-tool.js";

export function createLocalTools(env: Environment, options?: CreateFsToolsOptions) {
  return {
    ...createFsTools(env.fs, options),
    ...createBashTool(env.shell),
  };
}
