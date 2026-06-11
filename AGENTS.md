# CI/CD Agent Workspace Rules

## Project Toolchain

- Always run Node.js and pnpm commands through the repository-local toolchain.
- Preferred Windows runner:

```powershell
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop test -- src/checkpointHandoff.test.ts
```

- If invoking tools manually, prepend the local tool paths first:

```powershell
$env:PATH = "$PWD\.tools\node-v22.11.0-win-x64;$PWD\.tools;$env:PATH"
.\.tools\pnpm.exe --filter @cicd-agent/daemon typecheck
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
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core test
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/core build
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/daemon test
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop typecheck
.\scripts\windows\pnpm-project.ps1 --filter @cicd-agent/desktop build
```
