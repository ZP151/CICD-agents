# Azure DevOps MCP Source Intake

Upstream: `microsoft/azure-devops-mcp`

Repository: `https://github.com/microsoft/azure-devops-mcp`

Commit: `1ddc03970864bcd28521cd4bef7402f0dcfcb3a1`

License: MIT, preserved in `LICENSE.md`.

Copied paths:

- `LICENSE.md`
- `README.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `mcp.json`
- `server.json`
- root project configuration files such as `.editorconfig`, `.gitattributes`,
  `.gitignore`, `.prettierrc.json`, `eslint.config.mjs`, `jest.config.cjs`,
  and `tsconfig.jest.json`
- `src/**`
- `docs/**`
- `test/**`

Reason:

This source tree is vendored for source-first reuse of mature Azure DevOps MCP
tool implementations. The most relevant local reuse targets are:

- repository and pull request tools from `src/tools/repositories.ts`
- pipeline tools from `src/tools/pipelines.ts`
- work item and pull request linking tools from `src/tools/work-items.ts`
- authentication and connection patterns from `src/auth.ts` and `src/index.ts`
- MCP registration structure from `src/tools.ts`

Local integration status:

- Source copied only.
- No dependency has been installed yet.
- No local production code imports this source yet.
- Planned integration mode is external MCP process first, then selective porting
  of small adapter logic where direct process integration is too heavy.
