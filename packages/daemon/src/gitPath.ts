// Git-on-PATH handling lives next to the tool runtime that needs it (core's
// executor spawn recovery); the daemon re-exports it so server startup keeps
// the same public name.
export { ensureGitOnPath, injectGitPath } from "@mergepilot/core";
