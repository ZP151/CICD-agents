# MergePilot 手动测试回归验收矩阵

> 日期：2026-08-03。问题定义见 [手动测试问题分析](./manual-test-findings.md)，实施拆分见 [迭代计划](./iteration-plan.md)，Agent/MCP contract 见 [Agent / MCP / 开源复用架构](./agent-mcp-reuse-architecture.md)。测试数据一律使用脱敏占位符。

## 1. 执行约定

- `正常` 验证主路径，`失败` 验证明确错误，`恢复` 验证用户能在不丢上下文的情况下继续。
- UI 验证必须同时核对可见状态、焦点/键盘行为和是否出现重复操作。
- 后台状态通过 API response、database fixture、typed event 或受控 mock 核对，不读取生产 secret。
- 自动化不能替代真实 Azure DevOps OAuth、Windows 缩放和桌面安装包 smoke test。

## 2. OAuth 与授权恢复（MP-001）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- |
| RA-001 正常 | Developer；Project Link 已填 organisation，未授权 | 点击 `Enable Azure DevOps access`，在浏览器完成授权 | 按钮进入等待态；成功后 discovery 自动完成 | 保存 typed authorized state；原请求只重试一次 | 不在输入 organisation 时自动开浏览器 | OAuth adapter integration + desktop smoke |
| RA-002 失败 | Developer；OAuth provider 返回拒绝 | 点击授权并拒绝 consent | 显示 `Authorization declined` 与再次授权 | `unauthorized/user_declined`；保留 retry context | 不清空 Project Link 表单，不显示内部异常 | mocked callback integration |
| RA-003 恢复 | Developer；token 已过期 | 触发 discovery，点击 `Re-authorize` 并成功 | 原错误原位转为 loading/成功，焦点合理 | token state 更新；原 discovery 单次恢复 | 不循环弹浏览器，不重复创建 link | Playwright/Tauri flow + event assertions |
| RA-004 失败/安全 | Developer；连续点击授权或关闭浏览器 | 快速双击；关闭授权页 | 只有一个 in-flight 状态，可重试 | 单一 OAuth attempt；超时类型化 | 不记录 token、账号或 callback payload 到 Chat | concurrency unit + redaction test |

**自动化状态（2026-08-03 迭代）：** RA-001（typed authorized state + 单次重试：`adoOauthRecovery` 状态机与 api 测试）；RA-002（`user_declined` 分类与 `Authorization declined` UI：`adoDiagnostics.test.ts`、`adoOauthRecovery.test.ts`、`ProjectLinkAdoSection.test.tsx`）；RA-003（`Re-authorize` 与失败原位恢复：状态机 + 组件测试）；RA-004（单 in-flight 并发守卫与浏览器关闭分类：状态机测试 + core declined 测试）。真实浏览器 OAuth 与 expired-token 桌面流程仍需人工 smoke。

## 3. Agent 重复取证与工具循环（MP-002）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- |
| RA-005 正常 | Developer；repo 有已知 diff | 请求总结当前改动 | Agent 只执行推进目标所需的 status/diff，随后结论 | 每个 call 有 fingerprint；满足证据后结束 | 不重复等价 `git diff` | planner fixture + call count |
| RA-006 失败 | Developer；model 连续请求相同 tool/args | 运行受控 planner fixture | UI 标记重复调用被抑制，不伪装成成功执行 | runtime 拒绝无新状态的等价调用 | 不进入无限 tool loop | deterministic runtime unit |
| RA-007 恢复 | Developer；第一次 read tool timeout | 点击一次 `Retry` | 新 attempt 关联原 call，成功后继续 | 同 callId + incremented attempt；只重试幂等 read | 不重新执行已完成 write | timeout integration |
| RA-008 正常/变更 | Developer；第一次调用后 repo state 改变 | 修改 fixture state 后继续 | 第二次查询显示“状态已变化”而非重复 | fingerprint 包含 relevant state/version | 不错误去重真实新证据 | state-version unit |

## 4. 结论与证据分层（MP-003）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- |
| RA-009 正常 | Developer；turn 有多个成功 tool calls | 完成分析任务 | 最终回答先给结论；证据可按 call/artifact 展开 | final outcome 引用 evidence IDs | 不硬编码 `Verified facts:` 或重贴完整输出 | serialization snapshot |
| RA-010 失败 | Developer；没有足够证据 | 强制 tool unavailable | 回答明确“无法验证”并给恢复动作 | workflow blocked，缺失 capability 被记录 | 不编造 verified facts | planner negative fixture |
| RA-011 恢复 | Developer；补齐 connector/capability | 从 blocked state 点击继续 | 只补缺失证据并更新结论 | resume 关联原 workflow/evidence | 不重新执行全部已完成调用 | resume integration |

## 5. 执行时间线、动态状态与折叠（MP-004）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- |
| RA-012 正常 | Developer；命令持续输出 | 启动长命令 | 正在运行、耗时和增量输出可感知 | ordered progress events 关联 callId | 输出不串到相邻命令 | streamed event integration |
| RA-013 正常 | Developer；父组含多个子调用 | 折叠父组 | 父组和全部子组一并收起；展开恢复原顺序 | collapsed 仅为 UI projection | 不丢事件或改变执行 | component test |
| RA-014 失败 | Developer；命令 exit non-zero | 执行失败命令 | tool card 显示 failed、exit code、恢复动作 | `tool.call.failed` 与 bounded artifact | 不显示 completed，不吞 stderr | executor + UI snapshot |
| RA-015 恢复 | Developer；失败命令可修正参数 | 修改并重试 | 原失败保留，新 attempt 紧邻显示 | attempt 链完整 | 不覆盖原审计记录 | event-store integration |
| RA-016 取消 | Developer；命令运行中 | 点击 Stop | 立即显示 cancelling → cancelled | cancellation 传播到 process/tool | 不显示 generic error，不继续输出到新 turn | cancellation integration |

## 6. Session 标题（MP-005）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- |
| RA-017 正常 | Developer；新 session | 发送第一条明确目标 | 标题来自用户目标并在合理时机更新 | title source=`first_user_goal` | 不使用 assistant/tool output | store unit + UI test |
| RA-018 失败 | Developer；title generator timeout | 发送首条消息 | 使用清理后的用户首句 fallback | 标记 fallback source | 不保持无意义默认标题 | timeout unit |
| RA-019 恢复 | Developer；自动标题不理想 | 手动改名后继续对话 | 手动标题持续存在 | title source=`user`、locked | 不被后续 assistant 覆盖 | persistence integration |
| RA-020 安全 | Developer；首句含路径/secret-like token | 创建 session | 标题脱敏或使用安全 fallback | redaction before persistence | 不在侧栏暴露敏感值 | redaction unit |

## 7. 功能页与 Chat 状态隔离（MP-006）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- |
| RA-021 正常 | Developer；已有无关 Chat session | 在 Pipeline 页面运行分析 | 结果留在 Pipeline run surface | 创建 domain run record | 不 append 到活动 Chat | API/store integration |
| RA-022 失败 | Developer；Pipeline run 失败 | 从功能页触发失败 | 页面原位显示失败和恢复 | 失败属于 domain run | 不创建 assistant bubble | negative integration |
| RA-023 恢复 | Developer；已有成功 run | 点击 `Open in Chat` | 新建/选择明确 session，并显示来源提示 | session metadata 引用 runId/artifact | 不复制大 payload 或污染旧 session | navigation integration |
| RA-024 隔离 | Developer；切换 Project Link | 分别在两个 workspace 操作 | 各页面仅显示各自状态 | run records 按 workspace/link 隔离 | 不串用 target、session 或 artifact | multi-profile integration |

## 8. Environment 工作流（MP-007）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- |
| RA-025 正常 | Developer；所有依赖可用 | 打开 Environment 并检查 | `checking` 后全部 `ready`，显示最后检查时间 | health snapshot persisted/cached | 不重复启动昂贵检查 | health integration |
| RA-026 失败 | Developer；connector 缺失 | 运行检查 | 单项 `blocked`，显示原因和配置入口 | typed missing dependency | 不把其他 ready 项标红 | component + API fixture |
| RA-027 恢复 | Developer；修复配置后 | 点击 `Re-check` | 只重检相关项并转 ready | 新 snapshot 关联旧失败 | 不清空无关配置 | targeted recheck test |
| RA-028 降级 | Developer；可选能力不可用 | 运行检查 | 显示 `degraded` 与影响范围 | feature capability disabled | 不阻断不依赖该能力的工作流 | capability integration |

## 9. File / Artifact workspace（MP-008）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- |
| RA-029 正常 | Developer；文本文件存在 | 从 repo tree/tool artifact 打开 | 显示文件名、语言、高亮和来源 | artifact/file reference loaded | 不把完整文件复制进 Chat | viewer integration |
| RA-030 空状态 | Developer；未选文件 | 打开 workspace | 说明可从哪些入口打开文件 | 无 file request | 不显示伪 loading | component snapshot |
| RA-031 失败 | Developer；文件过大 | 打开超限文本 | 显示大小限制和下载/局部查看动作 | typed `too_large` | 不冻结 UI 或强行加载 | size-bound unit |
| RA-032 失败 | Developer；二进制文件 | 打开文件 | 显示 binary 状态和可用动作 | typed `binary` | 不以乱码渲染 | MIME fixture |
| RA-033 失败 | Developer；文件已删除或无权限 | 从旧 artifact 打开 | 区分 missing 与 permission denied | reference 保留、load failure typed | 不暴露绝对路径 | negative integration |
| RA-034 恢复 | Developer；文件恢复或重新选择 | 点击刷新/选择其他文件 | 成功加载且历史错误收起 | 新 load attempt | 不丢失 workspace navigation | UI integration |

## 10. Insight、Review Run、Review Queue（MP-009）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RA-035 正常 | Developer；PR 可读 | 打开 Insight | 显示无副作用预览和证据时间 | 可缓存 insight artifact | 不创建 Review Run，不写 ADO | API contract test |
| RA-036 失败 | Developer；PR context 不完整 | 运行 Insight | 显示缺失项与刷新动作 | insight blocked/partial | 不生成确定性通过结论 | negative fixture |
| RA-037 恢复 | Developer；补齐 pipeline/diff | 刷新 Insight | 更新同一 insight，不重复 finding | artifact version 更新 | 不写 Queue | refresh integration |
| RA-038 正常 | Reviewer；PR 可评审 | 启动 Automated Review | 显示 run progress 和版本化 findings | 创建 Review Run record | 默认不写 ADO | workflow integration |
| RA-039 失败 | Reviewer；review tool timeout | 启动 Review | run 显示 failed/partial 与 retry | completed evidence 保留 | 不创建重复 run decision | timeout integration |
| RA-040 恢复 | Reviewer；失败 run | 重试未完成步骤 | 新 attempt 归属于原 run | run history/audit 完整 | 不重复已完成 write | resume test |
| RA-041 写回 | Approver；Queue 中有 finding | 确认处置并批准写回 | 展示目标/内容/审批，完成后显示 ADO result | decision actor、approval、mutation result persisted | Insight/Review Run 不得隐式写回；不得 complete/abandon PR | mocked ADO mutation e2e |

## 11. Pipeline target 与 ADO 路径（MP-010）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RA-042 正常 | Developer；提供 stable Pipeline ID | 查询 Pipeline | 显示唯一目标和最新状态 | resolver 返回 typed target | 不做名称猜测 | resolver unit |
| RA-043 正常 | Developer；名称在 project 内唯一 | 按名称查询 | 显示解析后的 ID/名称 | mapping 可缓存并绑定 project | 不跨 project 选取 | resolver integration |
| RA-044 失败 | Developer；同名 Pipeline 两个 | 按名称查询 | 显示候选列表要求选择 | `ambiguous_target` | 不自动选择第一个 | fixture + UI test |
| RA-045 失败 | Developer；target 不存在 | 查询 | 显示 not found 与刷新/修改动作 | `target_not_found` | 不伪装成 MCP unavailable | negative unit |
| RA-046 失败 | Developer；无 target 权限 | 查询 | 显示 permission 问题与授权/管理员动作 | `permission_denied` | 不暴露不可见 target 详情 | auth fixture |
| RA-047 恢复 | Developer；补齐 ID 或权限 | 选择候选/重新授权后继续 | 原 workflow 从 resolver 恢复 | retry context 保留 | 不重新运行无关步骤 | resume integration |
| RA-048 MCP 缺失 | Developer；pipelines domain 禁用 | 查询 | 指明 capability/domain 缺失 | `capability_missing` | 不笼统宣称 Pipeline 不存在 | connector fixture |

## 12. Stop、timeout 与内部 Abort（MP-011）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RA-049 正常/Stop | Developer；turn 运行中 | 点击 Stop | `Cancelled by you`，可继续 | `cancelled_by_user` | 不显示 timeout/internal | cancellation e2e |
| RA-050 失败/timeout | Developer；mock tool 超时 | 等待 deadline | 显示 timeout、已等待时间、重试条件 | `timeout` + attempt | 不声称用户取消 | fake-timer integration |
| RA-051 失败/internal | Developer；注入 invariant error | 运行 turn | 显示内部失败、诊断 ID、重试/反馈 | `internal`，stack 仅安全日志 | 不暴露 stack/secret | fault injection |
| RA-052 恢复/Stop | Developer；已 Stop 且有完成步骤 | 点击继续 | 只继续未完成部分 | 新 turn 关联原 workflow | 不重复完成步骤 | resume integration |
| RA-053 恢复/timeout | Developer；幂等 read 超时 | 点击 Retry | 单次新 attempt；成功继续 | retry policy 被遵守 | 不自动重试 mutation | policy unit |
| RA-054 恢复/internal | Developer；瞬时内部问题消失 | 重试 turn | 新 attempt 与原诊断关联 | audit trail 完整 | 不覆盖原错误记录 | integration |

## 13. Project Link 组合框（MP-012）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RA-055 正常 | Developer；多个 links | 键盘打开、搜索、Enter 选择 | focus、highlight、选择结果清晰 | selected linkId 更新一次 | 不提交表单两次 | component/a11y test |
| RA-056 失败/空 | Developer；无匹配项 | 输入不存在名称 | 显示空状态和创建/清除动作 | selection 不变 | 不自动选旧项 | component test |
| RA-057 恢复 | Developer；搜索为空 | 清除搜索并选择 | 列表恢复，选中项可见 | selection 正确 | 不丢 composer draft | UI integration |
| RA-058 长名称 | Developer；超长中英文名称 | 浏览/选择 | 截断但 tooltip/accessible name 完整 | stable ID，不以 label 作 key | 不撑破布局 | visual + a11y snapshot |
| RA-059 失败/loading | Developer；links 请求失败 | 打开选择器后重试 | 区分 loading/error，保留 Retry | typed query failure | 不把失败当空列表 | query integration |

## 14. Composer 与图片（MP-013）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RA-060 正常/选择 | Developer；合法图片 | 通过文件选择添加并发送 | 预览、删除、发送后消息展示正常 | Markdown + structured attachment | 不把图片路径写入正文 | component + payload test |
| RA-061 正常/粘贴 | Developer；剪贴板有图片 | 粘贴到 composer | 只添加一次并保持正文焦点 | 单一 attachment ID | 不重复触发 paste/file handler | clipboard test |
| RA-062 正常/拖放 | Developer；合法图片 | 拖入 dropzone | drag state 明确、添加成功 | attachment validated | 不导航到本地文件 | drag-drop test |
| RA-063 正常/编辑 | Developer；已添加图片 | 裁剪、缩放、旋转、确认 | 新预览正确，可重新编辑 | attachment revision 更新 | 不新增第二份幽灵附件 | crop integration |
| RA-064 恢复/删除 | Developer；已编辑图片 | 删除后重新上传 | 删除立即生效，正文保留 | payload 不含旧 ID | 不发送已删除 data | state unit |
| RA-065 失败/超限 | Developer；超过数量或大小 | 添加图片 | 显示明确限制和替换动作 | validation error typed | 不清空已有合法附件 | boundary tests |
| RA-066 失败/格式 | Developer；损坏/不支持格式 | 添加 | 显示格式错误，composer 可继续 | 无 attachment persisted | 不崩溃或读取任意文件 | MIME/security test |
| RA-067 恢复/发送 | Developer；首次发送网络失败 | 点击重试 | 正文和附件仍在，成功后只出现一条消息 | idempotent send attempt | 不重复上传/重复消息 | network retry e2e |

## 15. 字体与排版（MP-014）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RA-068 正常/中文 | Developer；Windows 100% | 浏览核心页面中文内容 | 正文字形、字重、行高与导航一致 | semantic tokens 生效 | 不出现网络字体请求 | visual regression |
| RA-069 正常/混排 | Developer；中英文、数字、缩写 | 浏览 Chat/PR/Pipeline | baseline 稳定、层级清楚 | UI/mono role 正确 | 普通 metadata 不用 mono | visual + CSS lint |
| RA-070 缩放 | Developer；125% Windows | 浏览并操作 | 无裁切、重叠、按钮文字截断 | layout 不依赖固定像素高度 | 不缩小字体规避 | desktop visual |
| RA-071 缩放 | Developer；150% Windows | 浏览并操作 | 内容可滚动，焦点可见 | responsive layout | 不丢操作入口 | desktop visual |
| RA-072 主题 | Developer；浅色/标准/深色 | 切换主题 | 字体层级和对比保持 | token theme mapping 正确 | 不以变细字重补对比 | visual matrix |
| RA-073 失败/回退 | Developer；首选字体不可用 | 在字体缺失环境启动 | 中文使用指定系统 fallback，可读 | computed font 落在 allowlist | 不退回不一致 serif | computed-style test |
| RA-074 恢复/长文本 | Developer；长标签/状态 | 调整窗口并查看 tooltip | 截断可理解、完整内容可访问 | accessible label 保留 | 不溢出或隐藏关键信息 | component/a11y test |

## 16. MCP 协议与调用契约（MP-015）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RA-075 正常/lifecycle | Developer；受管 MCP server 兼容 | 连接并列出工具 | connector ready，显示 source/domain | version/capability negotiated；分页完成 | 不在 initialize 前调用 tool | SDK contract test |
| RA-076 失败/协议 | Developer；server 返回不支持版本 | 连接 | 显示 incompatible 与受支持信息 | `protocol_incompatible`，连接关闭 | 不继续发 tools/list | fake server test |
| RA-077 恢复/tool change | Developer；server 发 list_changed | 更新 server tool list | 工具可用状态刷新，不打断 composer | cache 按 session/version 更新 | 不保留已删除 tool 给 model | notification integration |
| RA-078 失败/schema | Developer；model 生成非法 args | 尝试执行 | 执行前显示参数问题 | `invalid_arguments`；server 未收到 call | 不把原始非法 payload 写日志 | schema unit |
| RA-079 失败/取消 | Developer；MCP call 运行中 | 点击 Stop | 状态为 cancelled，可重新发起 | 标准 cancel 传播，call closed | 不只隐藏 UI 而让远端继续 | fake server cancellation |
| RA-080 恢复/auth | Developer；remote connector token 过期 | 调用 read tool，重新授权 | 显示 re-authorize；成功后恢复一次 | auth refreshed；相同 workflow/call lineage | 不将 credential 传入 Project Link/Chat | OAuth + MCP integration |

## 17. Agent 架构与开源复用（MP-016）

| ID / 类型 | 前置条件与角色 | 操作步骤 | 预期 UI | 预期后台状态 | 不得发生的副作用 | 自动化建议 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RA-081 正常/事件 | Developer；一个 tool workflow | 完整执行并 reload session | Chat、步骤、Activity 状态一致 | 同一 event log/callId 可 replay | 不从 assistant prose 重建状态 | end-to-end replay test |
| RA-082 失败/断线 | Developer；SSE 中断 | 执行中断开并重连 | 已知状态恢复，缺口明确 | cursor/order 去重，事件不丢不重 | 不重复执行 tool | reconnect integration |
| RA-083 恢复/checkpoint | Developer；workflow blocked | 修复依赖并 resume | 从 durable checkpoint 继续 | workflow transition 合法 | 不创建第二事实源 | state-machine test |
| RA-084 正常/Adopt | Maintainer；拟引入通用组件 | 按 reuse gate 提交变更 | 产品行为保持，组件风格使用本地 token | registry 有 license/version/adapter/test | 不把 upstream types 穿透 domain/UI schema | PR checklist + contract test |
| RA-085 失败/Reject | Maintainer；候选 license/安全不合格 | 运行依赖评估 | 无产品 UI 变化；decision 记录 Reject | 不安装/不复制候选 | 不出现未登记源码 | dependency/license CI |
| RA-086 恢复/退出 | Maintainer；上游 breaking change | 切换 adapter 版本或回退 | 用户工作流不中断或有明确迁移提示 | pinned version、rollback 与 migration 可执行 | 不同时启用两个默认 runtime/state owner | adapter compatibility suite |

## 18.1 自动化状态总览（2026-08-04 回归运行）

| 问题 | 自动化覆盖 | 证据 | 剩余人工验收 |
| --- | --- | --- | --- |
| MP-001 (RA-001..004) | ✅ | `adoDiagnostics`、`adoOauthRecovery`（api+状态机）、`ProjectLinkAdoSection`、`userFacingErrors` | 真实浏览器 OAuth 流程 |
| MP-002 (RA-005..008) | ✅ | `toolCallDedup`（8）、planner 去重接线 | 真实模型循环中的抑制可见性 |
| MP-003 (RA-009..011) | ✅ | `chatPlannerEvidence`（15）、`FinalEvidencePanel`、chatSse evidence | 无 |
| MP-004 (RA-012..016) | ✅ | chatSse exitCode、`TurnTranscript`（折叠/状态）、`chatTurnTranscript` | 真实长命令流式 smoke |
| MP-005 (RA-017..020) | ✅ | `sessionTitle`（9） | 真实会话首条消息标题 |
| MP-006 (RA-021..024) | ✅ | `serverAdoWorkflowRoutes` session 隔离断言 | Open in Chat 导航 |
| MP-007 (RA-025..028) | ✅ | `environmentHealth`（6） | Re-check 桌面交互 |
| MP-008 (RA-029..034) | ✅ | `workspace.test`（403/404 typed）、空状态引导 | 真实文件入口 |
| MP-009 (RA-035..041) | ✅ | `WriteBackConfirmationPanel`（5）、disposition audit actor | 真实 ADO 写回（canary 阶段） |
| MP-010 (RA-042..048) | ✅ | `pipelineTargetResolver`（10）、route typed failure | 真实重名/权限场景 |
| MP-011 (RA-049..054) | ✅ | `failures`（11）、chatSse 终端映射、local cancellation | 真实 Stop/timeout smoke |
| MP-012 (RA-055..059) | ✅ | `ProjectLinkCombobox`（11） | 真实键盘/缩放交互 |
| MP-013 (RA-060..067) | ✅ | 附件 typed errors、`imageEditCanvas` | 真实裁剪交互 |
| MP-014 (RA-068..074) | ✅ | `typographyTokens`（5） | 125%/150% 缩放桌面复测 |
| MP-015 (RA-075..080) | ✅ | `mcpSdkAdapter`（9）、`capabilityActionPolicy`（10）、`mcpTools`（6）、bridge（4） | 真实 connector smoke、RA-080 授权过期恢复 |
| MP-016 (RA-081..086) | ✅（过程性） | 单一 timeline 事件源、复用 registry 更新（MCP SDK/popover/react-easy-crop）、CLAUDE.md 复用闸门 | 上游差异检查节奏、adapter 退出演练 |

运行证据：core 365 passed / daemon 317 passed / desktop 794 passed；desktop build 通过（2026-08-04，分支 `claudecode/optimize-bugfix`，12 个本地 commit）。

## 18. 追踪完整性

| 问题 | 正常路径 | 失败路径 | 恢复路径 |
| --- | --- | --- | --- |
| MP-001 | RA-001 | RA-002、RA-004 | RA-003 |
| MP-002 | RA-005、RA-008 | RA-006 | RA-007 |
| MP-003 | RA-009 | RA-010 | RA-011 |
| MP-004 | RA-012、RA-013 | RA-014、RA-016 | RA-015 |
| MP-005 | RA-017 | RA-018、RA-020 | RA-019 |
| MP-006 | RA-021、RA-024 | RA-022 | RA-023 |
| MP-007 | RA-025 | RA-026、RA-028 | RA-027 |
| MP-008 | RA-029、RA-030 | RA-031–033 | RA-034 |
| MP-009 | RA-035、RA-038、RA-041 | RA-036、RA-039 | RA-037、RA-040 |
| MP-010 | RA-042、RA-043 | RA-044–046、RA-048 | RA-047 |
| MP-011 | RA-049 | RA-050、RA-051 | RA-052–054 |
| MP-012 | RA-055、RA-058 | RA-056、RA-059 | RA-057 |
| MP-013 | RA-060–063 | RA-065、RA-066 | RA-064、RA-067 |
| MP-014 | RA-068–072 | RA-073 | RA-074 |
| MP-015 | RA-075 | RA-076、RA-078、RA-079 | RA-077、RA-080 |
| MP-016 | RA-081、RA-084 | RA-082、RA-085 | RA-083、RA-086 |

所有问题均具有正常、失败和恢复路径；自动化通过后仍需对 OAuth、真实 connector、Windows 缩放和桌面交互执行人工 smoke test。
