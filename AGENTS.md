# MergePilot Workspace Rules

## Project Toolchain

- Always run Node.js and pnpm commands through the repository-local toolchain.
- Preferred Windows runner:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop test -- src/checkpointHandoff.test.ts
```

- If invoking tools manually, prepend the local tool paths first:

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe --filter @mergepilot/daemon typecheck
```

## Sandbox And Approval Policy

- The Codex sandbox is a permission boundary, not the Node.js runtime.
- The project runtime is `.tools\node-v22.11.0-win-x64`; pnpm is `.tools\pnpm.exe`.
- Do not request elevated sandbox permission for normal `pnpm test`,
  `pnpm typecheck`, or `pnpm build` commands preemptively.
- First run the normal project-local command through
  `.\scripts\windows\pnpm-project.ps1`.
- Request elevated permission only after the normal command fails with a clear
  sandbox permission problem, such as blocked access to a required file or
  network resource.
- Do not treat TypeScript, Vite, Vitest, or pnpm failures as sandbox failures
  unless the error specifically shows a permission boundary issue.

## Verification Command Examples

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/core build
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/daemon test
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @mergepilot/desktop build
```
