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
| 2026-08-04 | MP-006/010 | RA-021..024, RA-042..048 | Daemon 真实流 | — | daemon 启动 → auth/status（authenticated）→ check-ado-tools（authStatus ok）→ inspect_pipeline 真实 #117（含 timeline/log excerpt） | canary-20260804c | ok（sessionId=None，P1-B 隔离确认；读到 run-4823 canceled） | n/a |
| 2026-08-04 | MP-010 | RA-042..048 | Pipeline run（产品路径） | run-4823 | 用产品函数 `triggerAzurePipelineRun` 在测试 branch（claudecode/test-mp010-20260804b）触发 #117 + 验证 sourceBranch | canary-20260804b | ok（inProgress，name 20260804.2） | 已 cancel（复核 completed/canceled）+ branch 已删（复核 0 剩余） |

## Canary 结论

- 真实 OAuth、分支创建、Draft PR、PR thread（RA-041 写回路径）、pipeline 触发/取消、Work Item 创建/删除全部通过写前读/写后验证。
- 一次只操作一个资源；timeout 场景未触发；全部临时资源已清理并远端复核。
- 未触碰 ClaimBot_API 现有 branch/PR/pipeline；未对非测试资源做任何写操作。

## Desktop runtime follow-up (2026-08-04)

| Scope | Evidence | Result |
| --- | --- | --- |
| Latest sidecar | Fresh `build:sidecar` followed by `packaged-sidecar-smoke.ps1` | Passed: version and desktop version `0.5.26`, `runtimeMode=desktop-sidecar`, index refresh and read-only chat completed. |
| Native desktop fresh-auth recovery | User-completed `sign out → Microsoft sign-in → browser return` plus current isolated sidecar probes | Passed: the browser return completed without the former stuck modal. `/auth/status` returned an authenticated persisted user and home-account reference; `/auth/accounts` found one MSAL account; `/auth/me` silently refreshed the credential and rewrote the non-secret user snapshot. No token or identity value is recorded here. The deep-link handler accepts only the credential-free `mergepilot://auth/complete` URI and focuses/emits `mergepilot-auth-complete`; its receipt is intentionally not retained as a credential log. A same-account refresh has no dramatic layout change by design: it closes the modal and refreshes the existing avatar/account context. |
| Turn terminal lifecycle | Read-only Project Link SSE run | Passed: observed `turn.started → turn.narrative.delta → tool groups → turn.execution.completed → turn.final.delta → turn.final.completed → turn.finished`. |
| Empty finalization regression | `agent_final` sends whitespace response before a valid finalization | Fixed and covered by `chatPlannerAgentFinalTool.test.ts`; the blank finalization is rejected and the same Turn continues to a non-empty conclusion. |
| First public narrative latency baseline | Nine isolated, request-cancelled narrator samples against the current sidecar | **Baseline accepted; optimization remains open.** App/SSE path (`request → turn.started`): P50 143 ms, P95 309 ms. Narrator path (`turn.started → first genuine narrative`): P50 2387 ms, P95 2500 ms. End-to-end (`request → first narrative`): P50 2500 ms, P95 2746 ms. This separates MergePilot's sub-500 ms route/SSE contribution from Azure/model-path TTFT; it is not a claim of Azure server-only latency. |
| Managed Azure DevOps MCP | Live connector check | Not runnable: every local Project Link currently has `adoMcpEnabled=false` and no MCP command/auth configuration. Adapter and contract tests are not treated as live-connector proof. |
| Health and GPT-5 configuration | Latest sidecar `/healthz`, Settings connection route and config persistence tests | Passed locally: health responds in 1–111 ms without issuing hidden GPT-5 requests; explicit connection checks use `max_completion_tokens=128`, `reasoning_effort=minimal`, and low verbosity. `config.toml` stores only configuration/reference data; local model keys are written to user `.env` and removed from WebView persistence. |
| Narrator isolation check | Three historical request-cancelled opening-only samples against the dedicated narrator deployment | Confirmed the same attribution before the nine-sample baseline: 3090 ms, 3218 ms and 3472 ms to first public model text. Health probes and fixed opening text are not contributing seconds. The `<500 ms` target is now a deployment/service optimization objective, not a release or functional-acceptance gate. |
| Browser-level Turn transcript | Current desktop Vite UI against the isolated sidecar; real read-only Project Link request | Passed: the UI showed `Working for 0s` immediately, then a genuine streamed action narrative and one `Ran commands` group. At terminal state the activity collapsed to `Worked for 15s`; the independent verdict, evidence, Copy control and timestamp appeared afterwards. The nested command view showed Shell, the executed command, bounded output and Success. |

### Follow-up acceptance conditions

- Do not replace the measured model delay with a fixed opening sentence. Any remedy must preserve model-authored public narration; `<500 ms` remains an optimization objective, with the P50/P95 baseline above used to evaluate it rather than to block functional acceptance.
- Configure one disposable/read-only Azure DevOps MCP connector before claiming managed-MCP live acceptance; record only the connector kind, operation class and outcome.
- When diagnosing a future browser-return issue, collect the modal source (`SSE`, deep link, focus or poll) and current `/auth/status` transition; do not log tokens or callback parameters.

## Rule reminders

- 一次只操作一个资源；写前读、写后验证；timeout 后先查询远端结果再决定是否重试；
  不因无响应直接重复写入；失败保留诊断；清理仅限本 ledger 记录的资源。
