# Production Verification Ledger (2026-08-03 iteration)

> 脱敏记录本 Goal 对真实 Azure DevOps 的受控写入。不保存 token、账号、邮箱、
> 内部 URL、完整 API payload 或个人标识；resource ID 以截断形式记录。

## Preflight snapshot

- Git remote: `<org>.visualstudio.com/<project>/_git/<repo>`（当前 workspace 仓库）
- 本地 Project Links：全部指向 `<org> / <project> / <repo>`，**与当前 workspace 仓库（<project>/<repo>）不一致**
- OAuth identity：本地缓存存在（tenant 与 <org> 组织一致），有效性待运行时确认
- Connector：Project Link 均未启用 managed MCP；native ADO adapter 路径可用
- 结论：**生产写入暂缓**。Git remote 与 Project Link 不一致（不同 project），
  且 <project> 属既有用户资源，未经本 Goal 选定，不得写入。
  需要维护者决策：为 `<project>/<repo>` 创建测试用 Project Link，
  或指定其它测试 workspace 后再恢复 canary 阶段。

## Write ledger

| Date | Issue | Test | Resource type | Resource ID (truncated) | Operation | callId | Result | Cleanup |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| (pending) | MP-001 | RA-001 | OAuth | — | enable → discovery retry | (pending) | — | — |

## Rule reminders

- 一次只操作一个资源；写前读、写后验证；timeout 后先查询远端结果再决定是否重试；
  不因无响应直接重复写入；失败保留诊断；清理仅限本 ledger 记录的资源。
