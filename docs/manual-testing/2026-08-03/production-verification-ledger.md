# Production Verification Ledger (2026-08-03 iteration)

> 脱敏记录本 Goal 对真实 Azure DevOps 的受控写入。不保存 token、账号、邮箱、
> 内部 URL、完整 API payload 或个人标识；resource ID 以截断形式记录。

## Preflight snapshot

- **Target workspace（2026-08-04 维护者确认）：** TeBS-ClaimBot / ClaimBot_API
- 对应 Project Link：`eb2f6c87`（"ClaimBot_API link"，adoPipelineId 117，adoPipelineName ClaimBot_API）
- Git remote（开发仓库）：`<org>.visualstudio.com/<project>/_git/<repo>`（DevAgent_CICD，仅用于本迭代代码）
- OAuth identity：**真实只读 canary 验证通过**（静默令牌有效）
- Connector：native ADO adapter 路径；managed MCP 未启用
- 生产写入范围：仅 TeBS-ClaimBot / ClaimBot_API 上由本 Goal 创建并记录 ID 的临时资源
- 禁止：对 ClaimBot_API 现有 branch/PR/pipeline 做任何修改或触发（除本 Goal 创建的测试资源）

## Write ledger

| Date | Issue | Test | Resource type | Resource ID (truncated) | Operation | callId | Result | Cleanup |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-08-04 | MP-015 | RA-075 | OAuth/read | — | 只读 canary：project/repo/pipeline/PR/run 查询 | canary-20260804a | ok（8 projects、2 repos、#117、3 个活跃 PR、5 个近期 run） | n/a |
| 2026-08-04 | MP-013 | RA-060..067 | Branch | claudecode/test-mp001-20260804a | 创建测试 branch（ref → main head dffeecd5）+ 写后验证 | canary-20260804a | ok | 已删除（复核 0 剩余） |
| 2026-08-04 | MP-009 | RA-041 | Draft PR | PR-2794 | 创建 [MergePilot E2E] Draft PR + 验证 isDraft | canary-20260804a | ok | 已 abandoned（复核 confirmed） |
| 2026-08-04 | MP-009 | RA-041 | Thread | PR-2794 / thread-8140 | Review Queue 写回机制（Marked blocked comment + mergepilot-e2e 标签） | canary-20260804a | ok | 随 PR abandoned |
| 2026-08-04 | MP-010 | RA-042..048 | Pipeline run | run-4822 | 在测试 branch 触发 pipeline #117 + 验证 sourceBranch | canary-20260804a | ok（notStarted → inProgress） | 已 cancel（复核 completed/canceled） |
| 2026-08-04 | MP-009 | RA-038..041 | Work Item | WI-7911 | 创建 [MergePilot E2E] Task + 验证标题 | canary-20260804a | ok | 已删除（复核 404） |
| 2026-08-04 | MP-001 | RA-001..004 | OAuth | — | 静默令牌真实获取；显式授权流程保持本地 UI 覆盖 | canary-20260804a | ok（token 2070 chars） | n/a |

## Canary 结论

- 真实 OAuth、分支创建、Draft PR、PR thread（RA-041 写回路径）、pipeline 触发/取消、Work Item 创建/删除全部通过写前读/写后验证。
- 一次只操作一个资源；timeout 场景未触发；全部临时资源已清理并远端复核。
- 未触碰 ClaimBot_API 现有 branch/PR/pipeline；未对非测试资源做任何写操作。

## Rule reminders

- 一次只操作一个资源；写前读、写后验证；timeout 后先查询远端结果再决定是否重试；
  不因无响应直接重复写入；失败保留诊断；清理仅限本 ledger 记录的资源。
