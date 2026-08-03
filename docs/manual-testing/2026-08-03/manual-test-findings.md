# MergePilot 手动测试问题分析（2026-08-03）

> 本文整理 2026-08-03 手动测试 Word 记录中的 22 页文字与 21 张截图，并对照 `origin/main@a796e7a` 的当前源码。原始材料包含内部地址、账号、头像、标识符、本机路径及疑似历史凭据，因此本文只保留脱敏后的文字化证据索引，不复制截图或敏感值。

- 后续实施顺序见：[迭代计划](./iteration-plan.md)
- 验收与回归场景见：[回归验收矩阵](./regression-acceptance-matrix.md)
- Agent、MCP 与开源复用边界见：[Agent / MCP / 开源复用架构](./agent-mcp-reuse-architecture.md)

## 1. 审计范围与判断规则

### 1.1 范围

本次分析覆盖以下产品表面：

- Project Link 与 Azure DevOps discovery。
- Chat 中 Agent 规划、工具执行、结论与会话历史。
- Environment、Result/File workspace 与 Composer。
- Pipelines、Pull Requests、AI Insight 与 Review Queue。
- 全局视觉一致性、字体排版和键盘可访问性风险。
- MCP 调用契约、Agent runtime 边界和开源复用策略。

本次没有重新运行桌面应用中的完整流程，因此截图能确认的仅是测试时观察到的状态；当前源码中已经存在、但截图未证明端到端可用的能力，统一标记为“当前版本部分解决”或“需要最新构建复测”。本文不声称完成了完整 WCAG 合规审计。

### 1.2 状态定义

| 状态 | 含义 |
| --- | --- |
| 测试已复现 | 原始记录中有明确操作描述、错误结果或截图证据。 |
| 源码确认 | 当前 `main` 中能找到直接支持该判断的实现证据。 |
| 当前版本部分解决 | 当前源码已有相关能力，但仍缺入口、语义、状态闭环或端到端证明。 |
| 需要最新构建复测 | 只能证明旧测试构建存在问题，或当前源码可能已改变相关行为。 |
| 需要产品决策 | 问题核心是职责、命名或风险边界，需要先确定产品模型。 |

### 1.3 严重度定义

| 优先级 | 含义 |
| --- | --- |
| P0 | 阻断核心接入，或存在需要立即核实的安全暴露。 |
| P1 | 导致工作流错误、状态串联、不可恢复失败或信任下降。 |
| P2 | 明显降低效率、可发现性、一致性或可读性。 |
| P3 | 不阻断任务的视觉和交互润色。 |

## 2. 总体结论

当前问题不是单一 UI 瑕疵，而是六类相互影响的缺口：

1. **错误缺乏恢复路径。** OAuth、Pipeline target 和 Abort 场景能指出失败，却不能稳定地把用户带回可继续的状态。
2. **执行证据与最终结论没有分层。** Agent 重复解释、重复取证，结论又重新陈列工具证据，造成“做了很多但没有推进”的感受。
3. **功能边界没有通过产品语言表达。** Insight、Automated Review、Review Queue、Pipeline page 和 Chat 都有合理的后台能力，但入口、持久化和副作用边界不清楚。
4. **视觉系统存在，但没有落实为语义令牌。** 左侧导航观感较完整；其他页面大量自行组合字号、字重、行高和 `font-mono`，导致字体看起来像多个系统拼在一起。
5. **MCP 已经接入，但协议与产品契约不完整。** 当前手写 stdio client 覆盖 `initialize`、`tools/list` 和 `tools/call`，却没有完整处理协议版本协商、能力声明、分页、tool-list change、标准取消、结构化结果和稳定错误分类；当前 framing 也需要按官方 stdio 规范复核。
6. **仓库已有高价值复用资产，但缺少强制复用闸门。** `third_party`、`@assistant-ui/react`、Radix、CodeMirror 等已经提供基础，后续应先从这些实现中提取 Interface/Adapter，再决定是否自研，避免继续局部补丁。

## 3. 问题总览

| ID | 问题 | 优先级 | 当前判断 |
| --- | --- | --- | --- |
| MP-001 | Azure DevOps OAuth 无显式恢复入口 | P0 | 测试已复现、源码确认 |
| MP-002 | Agent 重复取证与无效工具循环 | P1 | 测试已复现、当前版本部分解决 |
| MP-003 | 结论硬编码 `Verified facts:` 并重复证据 | P1 | 测试已复现、源码确认 |
| MP-004 | 命令输出、运行反馈与折叠层级不清晰 | P1 | 测试已复现、当前版本部分解决 |
| MP-005 | Session 标题生成时机和来源不合理 | P2 | 测试已复现、源码确认 |
| MP-006 | 功能页操作写入无关 Chat session | P1 | 测试已复现、源码确认 |
| MP-007 | Environment 工作流未形成闭环 | P2 | 测试已复现、当前版本部分解决 |
| MP-008 | 文件预览入口与空状态缺少可发现性 | P2 | 测试已复现、当前版本部分解决 |
| MP-009 | Insight、Review Run 与 Review Queue 职责重叠 | P1 | 源码确认、需要产品决策 |
| MP-010 | Pipeline target 解析与 ADO MCP 路径不完整 | P1 | 测试已复现、需要最新构建复测 |
| MP-011 | Abort、Stop、超时和内部失败无法区分 | P1 | 测试已复现、需要最新构建复测 |
| MP-012 | Project Link 选择器未使用统一组件 | P2 | 测试已复现、源码确认 |
| MP-013 | Composer 图片能力部分完成，富文本和编辑闭环不足 | P2 | 当前版本部分解决 |
| MP-014 | 字体与排版系统不一致 | P2 | 用户反馈、源码确认 |
| MP-015 | MCP 调用缺少统一协议适配、能力协商与错误契约 | P1 | 源码确认、需要最新构建复测 |
| MP-016 | Agent 架构与开源复用缺少强制边界 | P1 | 源码确认、需要产品决策 |

## 4. 详细发现

### MP-001：Azure DevOps OAuth 无显式恢复入口

- **场景：** 用户在 Project Link 中输入 Azure DevOps organisation 后触发 project/repository/pipeline discovery。
- **实际表现：** 页面显示 token 不可用，但只给出错误文字；测试者必须离开应用，通过命令手动触发授权，再回到页面重试。
- **预期行为：** 错误区域提供 `Enable Azure DevOps access` 主操作；由用户主动点击后打开浏览器授权，成功后自动重试原 discovery。输入 organisation 时不得循环弹出浏览器。
- **用户影响：** 首次接入被阻断，且恢复步骤依赖外部命令知识。
- **严重度：** P0。
- **证据索引：** 源段落 `P1-P39`；截图 `image1`。测试记录确认手动调用授权端点后 discovery 恢复。
- **当前源码状态：** 已实现（2026-08-03 迭代，commit 见 `iteration-plan.md` 实施状态）。API 层抛出带 `authStatus`/`authMode`/`retryable` 的 `AdoDiscoveryError` 与 `AzureDevOpsOAuthError`；表单 runtime 保存 typed `discoveryFailure` 并运行纯函数 OAuth 恢复状态机（单 in-flight、成功只重试原 discovery 一次、declined/失败保留用户输入与诊断）；`ProjectLinkAdoSection` 在错误原位提供 `Enable Azure DevOps access` / `Re-authorize` 按钮，授权中显示等待态，成功后自动重试一次。consent 拒绝/关闭浏览器由 daemon 层分类为 `user_declined`，不再被扁平化为 `oauth_unavailable`。真实 OAuth 浏览器流程仍需桌面 smoke test。
- **可能原因：** `authStatus` 在 API 错误包装层被扁平化，UI 无法稳定识别 `oauth_unavailable`。
- **建议方向：** 使用带 `status`、`authStatus`、`message`、`retryable` 的类型化错误；保存失败的 discovery kind；显式授权成功后只重试该 kind。
- **验收条件：** 见 `RA-001` 至 `RA-004`。

### MP-002：Agent 重复取证与无效工具循环

- **场景：** 用户要求评估部署风险或审查当前分支改动。
- **实际表现：** Agent 多次解释“需要检查 diff”，重复调用范围近似的 `git diff`，并在工作区状态未知时先运行 `repo_refresh_index`；多次工具调用没有显著增加结论质量。
- **预期行为：** 先用最小命令确认 branch/status/changed files，再按变更集一次性读取相关 diff；只有用户请求语义索引或任务确需仓库语义上下文时才刷新索引。
- **用户影响：** 响应慢、成本高、执行过程显得不可靠，并增加输出被截断的概率。
- **严重度：** P1。
- **证据索引：** 源段落 `P41-P255`；截图 `image2-image4`。
- **当前源码状态：** `packages/core/src/chatPlannerGuards.ts` 已要求 live Git state 优先使用 status/branch/diff，表明当前版本已部分处理截图中的顺序问题；仍需最新构建验证重复 diff 是否被抑制。
- **可能原因：** planner 缺少等价调用去重和“证据已足够”停止条件；长输出被截断后模型错误地认为尚未读取。
- **建议方向：** 维护本 turn 的工具调用指纹；相同 repo/path/args 不重复执行；diff 结果返回结构化文件/hunk 摘要和明确 `truncated` 标志；planner 遇到已覆盖的文件集合直接进入结论。
- **验收条件：** 见 `RA-005` 至 `RA-008`。

### MP-003：结论硬编码 `Verified facts:` 并重复证据

- **场景：** Agent 完成取证后生成最终答复。
- **实际表现：** 最终回复固定以 `Verified facts:` 或同类段落开头，重复列出 branch、untracked files 和多个相同 reviewed diff；页面标题还会截取这段机械化内容。
- **预期行为：** 结论根据用户任务选择结构；工具事实只保留支持结论的最小集合，完整过程留在 execution transcript。
- **用户影响：** 用户难以快速识别真正判断，结果显得模板化，重复信息挤占可视空间。
- **严重度：** P1。
- **证据索引：** 源段落 `P41`、`P259`；截图 `image2`、`image5-image7`。
- **当前源码状态：** `packages/core/src/chatPlannerEvidence.ts` 明确拼接 `Verified facts:`，因此当前问题仍由源码直接造成。
- **可能原因：** 证据补全逻辑在最终文本阶段无条件追加，而没有感知结论中已经包含的事实或当前任务类型。
- **建议方向：** 将“事实、判断、建议”建模为结构化 outcome；renderer 根据任务和证据密度选择展示形式；禁止固定英文标题作为协议的一部分。
- **验收条件：** 见 `RA-009` 至 `RA-011`。

### MP-004：命令输出、运行反馈与折叠层级不清晰

- **场景：** Chat 展示多条运行命令、长输出和完成状态。
- **实际表现：** Shell 区域出现只有行号或错位的空白输出；运行期间缺少稳定的当前命令反馈；父级 `Ran commands` 与子级命令折叠状态不一致。
- **预期行为：** 当前执行命令在单一位置动态更新；完成后显示耗时和状态；父组折叠时所有子级视觉上同时收起，再次展开时恢复明确的默认状态。
- **用户影响：** 用户无法判断任务是否卡住、是否仍在执行，以及哪个输出对应哪个命令。
- **严重度：** P1。
- **证据索引：** 源段落 `P41`、`P258`；截图 `image3-image6`。
- **当前源码状态：** 当前已有 `TurnTranscript` 和命令行渲染，但截图所示状态仍需要用最新构建复测；仅从源码不能证明 DOM 更新、滚动和折叠组合在真实流式响应下正确。
- **可能原因：** 工具组状态、子命令展开状态和流式 stdout 分别管理；行号 renderer 对空行或 ANSI 处理不完整。
- **建议方向：** 统一 transcript group state；为 running/completed/error 定义明确状态机；父组关闭时不渲染子树；输出先标准化 CRLF、ANSI 和空行再编号。
- **验收条件：** 见 `RA-012` 至 `RA-016`。

### MP-005：Session 标题生成时机和来源不合理

- **场景：** 新建会话并发送首条需求，执行中或执行后查看顶部标题和历史列表。
- **实际表现：** 标题先使用原始用户长输入占位，之后可能被最终结论或 `Verified facts` 文本替代，标题又长又缺乏任务语义。
- **预期行为：** 收到第一条有效用户需求后立即生成稳定的精简标题；后续回答不自动覆盖，用户手动重命名始终优先。
- **用户影响：** 历史会话难以扫描，运行中标题跳变，恢复任务时难以定位。
- **严重度：** P2。
- **证据索引：** 源段落 `P261`；截图 `image7`。
- **当前源码状态：** `packages/daemon/src/chatHistorySerialization.ts` 在没有持久化标题时使用最后一条可展示消息作为 title/preview；桌面端支持手工重命名，但没有首条需求驱动的自动标题生命周期。
- **可能原因：** title 和 preview 共用回退来源，没有区分“任务名”与“最近内容”。
- **建议方向：** 首条用户消息入库后生成 4-8 个词的标题并写入现有 session metadata；生成失败时用安全截断的首条用户消息，不使用 assistant 结论。
- **验收条件：** 见 `RA-017` 至 `RA-020`。

### MP-006：功能页操作写入无关 Chat session

- **场景：** 用户在 Pipelines 页面查看 runs、运行 AI analysis 或在 PR 页面打开 insight。
- **实际表现：** 功能页产生的结果被追加到当前 Chat session，用户回到对话后看到未从对话触发的内容。
- **预期行为：** 功能页结果保留在对应 workspace 的持久化 artifact/history；只有用户明确选择 `Ask in Chat` 或 `Open in Chat` 时才创建带来源的 Chat handoff。
- **用户影响：** 会话历史被污染，用户无法判断消息来自主动对话还是其他页面操作。
- **严重度：** P1。
- **证据索引：** 源段落 `P262`；截图 `image8-image9`。
- **当前源码状态：** `packages/daemon/src/workflows/pipelineWorkflow.ts` 在收到 `sessionId` 时会调用 `appendWorkflowActionAssistantBubble()`；这条跨 workspace 写入路径需要收紧。
- **可能原因：** workspace actions 复用了 Chat workflow action 协议，并默认携带活动 session。
- **建议方向：** 功能页调用不传 `sessionId`；结果写入所属 artifact store；显式 handoff 时再创建 Chat user bubble 和 source reference。
- **验收条件：** 见 `RA-021` 至 `RA-024`。

### MP-007：Environment 工作流未形成闭环

- **场景：** 用户打开 Chat 右侧 Environment，查看 repo、branch、changes、Project Link 和工作流操作。
- **实际表现：** 测试记录认为信息层级混乱、入口多但任务闭环不明确；branch、commit/push、PR insight、Pipeline 和 progress 同时争夺注意力。
- **预期行为：** Environment 只回答“当前环境是什么、是否安全、下一步能做什么”；复杂结果进入 Result/File workspace，运行进度进入 Progress。
- **用户影响：** 用户需要理解内部架构才能选择入口，容易在 Environment、Composer quick action 和主页面之间迷失。
- **严重度：** P2。
- **证据索引：** 源段落 `P264`；截图 `image10`。
- **当前源码状态：** 当前 `WorkspaceEnvironmentCard` 已拆成 changes、branch、commit、recovery 和 Project Link 子面板，属于部分解决；仍需真实流程验证信息密度和操作闭环。
- **可能原因：** 面板按功能增长而非用户决策顺序组织，状态与动作缺少一致的优先级。
- **建议方向：** 固定顺序为 Context -> Health -> Primary next action -> Secondary actions；同一时刻只突出一个主操作；其余能力进入菜单或对应 workspace。
- **验收条件：** 见 `RA-025` 至 `RA-028`。

### MP-008：文件预览入口与空状态缺少可发现性

- **场景：** 用户打开右侧文件/结果区域，希望查看 Agent 引用或 changed file。
- **实际表现：** 面板只显示 `No file selected`，没有文件来源、最近文件、选择方法或返回路径；测试者怀疑功能被隐藏。
- **预期行为：** 未选择文件时解释三种入口：从 changed files、tool output/source chip 或文件搜索打开；最近或相关文件可直接选择。
- **用户影响：** 已实现的 preview 能力不可发现，空白面板占据大量空间。
- **严重度：** P2。
- **证据索引：** 源段落 `P265`；截图 `image11`。
- **当前源码状态：** 当前存在 `/workspace/file` API、`WorkspaceFilePreviewError` 和 Source/Artifact workspace，说明读取能力已部分存在；问题更接近导航和空状态，而非完全缺少预览。
- **可能原因：** preview 依赖上游 source selection，但空状态没有展示这一依赖。
- **建议方向：** 空状态提供入口、快捷键和最近引用；选择 source 时自动打开 preview；错误状态保留当前选择并给出恢复动作。
- **验收条件：** 见 `RA-029` 至 `RA-034`。

### MP-009：Insight、Review Run 与 Review Queue 职责重叠

- **场景：** 用户在 PR 页面看到 `Refresh insight`、`Run review`、`Open insight`，随后在 Review Queue 再次看到 rerun 和 Actions。
- **实际表现：** 两个 AI 操作产出相似文本；用户无法判断哪个会持久化、哪个会写回 ADO、哪个代表真实 Reviewer 行为。
- **预期行为：** 产品模型必须清楚区分：
  - **Insight：** 无副作用的即时预览，可刷新，不进入人工处置队列。
  - **Automated Review：** 生成可审计的持久化 review run、findings 和 decision queue。
  - **Review Queue：** 处理已生成的 review run，支持人工 disposition 与受控 ADO reviewer write-back。
  - **Complete/Abandon PR：** 本轮继续留在 ADO，不与 Automated Review 混用。
- **用户影响：** 可能误把 AI 分析当作审批，或重复运行成本较高的 review。
- **严重度：** P1。
- **证据索引：** 源段落 `P266-P270`；截图 `image12-image15`，其中一张 ADO 原生 PR 截图用于说明 reviewer vote 与 PR completion 是不同动作。
- **当前源码状态：** `PullRequests.tsx` 同时展示 `Refresh insight` 与 `Run review`；`ReviewQueueCard.tsx` 提供 findings、rerun、Acknowledge、Mark safe、Block、Request changes。后台职责已经不同，但 UI 文案和解释不足。
- **可能原因：** 技术能力按接口命名直接暴露，缺少用户心智模型和副作用说明。
- **建议方向：** 保留两级模型并改写说明：`Refresh insight` 标注 read-only；`Run automated review` 明确“创建 review run 并发送到 Review Queue”；Review Queue 显示 run 来源、版本和写回状态。
- **验收条件：** 见 `RA-035` 至 `RA-041`。

### MP-010：Pipeline target 解析与 ADO MCP 路径不完整

- **场景：** 用户要求为当前分支准备或触发指定 Pipeline。
- **实际表现：** Agent 只得到 pipeline 名称或展示编号，无法确定实际 pipeline ID；反复检查 Git branch/status，最终没有明确说明“缺少什么、如何修复”；上传的 Pipeline 截图也没有转化为可靠 target。
- **预期行为：** 依次使用 Project Link 中持久化的 `adoPipelineId`、repository-filtered discovery、用户选择；名称重复时必须让用户确认。启用 managed ADO MCP 时，读写路径和权限状态必须可观察。
- **用户影响：** Pipeline 主流程无法完成，用户不知道应修改 Project Link 还是授权连接器。
- **严重度：** P1。
- **证据索引：** 源段落 `P271-P272`；截图 `image16-image18`。
- **当前源码状态：** Project Link 数据模型包含 pipeline name/id，当前也有 pipeline workflow 和 ADO discovery；但测试证据显示端到端 target resolution 没有闭环，需要在最新构建复测。
- **可能原因：** planner 只看到用户文本和本地 Git 状态，没有获得结构化 Project Link pipeline target；MCP enablement 与实际 tool availability 没有统一诊断。
- **建议方向：** 建立单一 `PipelineTargetResolver` 结果：`resolved`、`missing`、`ambiguous`、`unauthorized`、`connector_unavailable`；所有页面和 Chat 共用。
- **验收条件：** 见 `RA-042` 至 `RA-048`。

### MP-011：Abort、Stop、超时和内部失败无法区分

- **场景：** 用户要求 review、commit/push 或其他多步骤操作，执行在若干只读命令后停止。
- **实际表现：** 最终统一显示 `Request was aborted. Please adjust the request or try again.`，不能判断是用户 Stop、客户端取消、daemon 超时、模型取消还是工具失败。
- **预期行为：** 不同终止原因拥有不同状态、日志和恢复动作；已经完成的只读证据继续保留。
- **用户影响：** 用户只能盲目重试，可能重复执行昂贵操作；错误也难以诊断。
- **严重度：** P1。
- **证据索引：** 源段落 `P274-P275`；截图 `image19-image20`。
- **当前源码状态：** 现有测试覆盖 Stop 与 late response，但截图所示真实流程仍需复测；不得由单元测试推断所有 Abort 原因已正确分类。
- **可能原因：** AbortSignal 在多个层级共用，最终错误映射丢失 origin/reason/phase。
- **建议方向：** 定义 `user_stopped`、`client_cancelled`、`deadline_exceeded`、`tool_failed`、`model_failed`、`daemon_restarted`；UI 根据类型显示 Resume、Retry failed step 或 Start new turn。
- **验收条件：** 见 `RA-049` 至 `RA-054`。

### MP-012：Project Link 选择器未使用统一组件

- **场景：** 用户在 Composer 或 Environment 中切换 Project Link。
- **实际表现：** Composer 使用浏览器原生下拉，长列表样式、选中态、搜索和键盘体验与其他 workbench 菜单不同。
- **预期行为：** 使用全局 Combobox：可搜索、显示 repo/ADO 辅助信息、支持长名称、省略号 tooltip、空状态与创建入口。
- **用户影响：** 常用入口显得粗糙，Project Link 多时选择效率低。
- **严重度：** P2。
- **证据索引：** 源段落 `P277`；截图 `image21`。
- **当前源码状态：** `ComposerShell.tsx` 直接渲染 `<select aria-label="Composer Project Link">`，源码确认问题仍存在。
- **可能原因：** Composer 早期采用原生控件，尚未迁移到共享 workbench primitive。
- **建议方向：** 基于现有 Radix Dropdown/Popover primitives 形成统一 Combobox，不再引入第二套视觉系统。
- **验收条件：** 见 `RA-055` 至 `RA-059`。

### MP-013：Composer 图片能力部分完成，富文本和编辑闭环不足

- **场景：** 用户输入长需求、代码、列表或上传截图参与对话。
- **实际表现：** 测试记录要求富文本、图片上传和图片编辑；当前源码已支持选择、粘贴、拖放、最多三张图片、大小限制、缩略图和删除，但文本仍由普通 `textarea` 承载，图片只能原样发送。
- **预期行为：** 输入区支持 Markdown 语义的粗体、列表、链接、inline code/code block、撤销重做；图片在发送前可裁剪、缩放、旋转和替换，发送后保留文件名与可查看预览。
- **用户影响：** 复杂工程需求难以组织；无关区域和敏感信息不能在发送前裁掉。
- **严重度：** P2。
- **证据索引：** 源段落 `P277`；截图 `image18`、`image21`。
- **当前源码状态：** `ComposerShell.tsx` 与 `useComposerImageAttachments.ts` 已完成基础图片附件；附件仍以 transient data URL 参与当前消息，编辑器仍为 `textarea`。因此应升级而非从零重建。
- **可能原因：** 消息接口以 plain string 为中心，图片能力先作为独立附件增量加入。
- **建议方向：** 使用 Tiptap 开源核心承载编辑体验，但发送边界继续输出 Markdown string + structured image attachments；第一阶段图片编辑只做 crop/zoom/rotate，不加入滤镜或大型图片工作台。
- **验收条件：** 见 `RA-060` 至 `RA-067`。

### MP-014：字体与排版系统不一致

- **场景：** 用户比较主页面左侧导航与 Chat、PR、Pipeline、Environment、Settings 等区域。
- **实际表现：** 左侧导航的字体观感较好，其他区域的正文、标签、状态和数据文本显得松散或机械；部分非代码信息使用等宽字体，字号和行高组合缺少统一规则。
- **预期行为：** 以左侧导航为视觉基准，建立 UI、正文、元数据和代码四类语义字体角色；中英文混排保持稳定字形和行高。
- **用户影响：** 页面像由多个子产品拼接，信息层级难以扫描，中文回退字体在不同机器上可能明显变化。
- **严重度：** P2。
- **证据索引：** 用户补充反馈；侧栏可参考 `image2`、`image5`、`image15`，正文差异可参考 `image8-image13`、`image16-image21`。
- **当前源码状态：** `base.css` 为全局和侧栏使用同一系统 sans-serif 栈；侧栏之所以更协调，主要来自固定的 13px/20px、medium weight、分组标签字距和对比度。其他页面大量自行组合 `text-*`、`leading-*`、`font-medium` 与 `font-mono`，且没有语义字体 token。
- **可能原因：** 视觉重构统一了颜色和 surface，但 typography 仍由局部 Tailwind class 决定；中文字体没有显式回退优先级。
- **建议方向：** 建立 `--font-ui`、`--font-mono` 和 semantic type scale；UI 字体优先 `Segoe UI Variable Text`/`Segoe UI`，中文回退到 `Microsoft YaHei UI`、`PingFang SC`、`Noto Sans CJK SC`；等宽字体仅用于代码、命令、路径、分支和 commit hash。
- **验收条件：** 见 `RA-068` 至 `RA-074`。

### MP-015：MCP 调用缺少统一协议适配、能力协商与错误契约

- **场景：** Agent 通过 Project Link 加载 Azure DevOps MCP 工具，执行 Pipeline、Repository 或 Work Item 查询，并在授权过期、工具改名或连接中断后恢复。
- **实际表现：** 测试记录中 Agent 无法稳定找到 Pipeline target，随后给出笼统失败结论；MCP 是否启用、加载了哪些 domain、缺少哪个 capability、是否需要授权，对用户不可见。
- **预期行为：** MCP connector 在执行前完成协议版本与 capability 协商、分页加载工具、schema 校验、domain 过滤、风险分类和授权预检；执行过程产生统一事件，失败必须落入可恢复的类型化状态。
- **用户影响：** Agent 可能把“未启用”“未授权”“工具不存在”“参数不合法”和“远端业务失败”混为一谈；重试会变成重复工具循环，写操作也难以建立可信审计链。
- **严重度：** P1。
- **证据索引：** 源段落 `P271-P272`；截图 `image16-image18`；另结合当前源码审计。
- **当前源码状态：** `packages/core/src/tools/mcp.ts` 已有手写 `StdioMcpClient` 和 tool wrapper，`packages/core/src/tools/capabilities.ts` 已有风险分类与审批入口，`docs/managed-mcp-connectors.md` 已限制凭据和可执行配置。但 client 固定旧协议版本，只保存少量 tool metadata，不处理 `nextCursor`、`notifications/tools/list_changed`、server capability、标准取消、`outputSchema`/`structuredContent`，并以 `Content-Length` frame 读写；官方 2025-06-18 stdio 规范要求每条 JSON-RPC 消息以换行分隔。该差异需要最新构建的真实 connector 测试确认。
- **可能原因：** 最小 MCP bridge 先用于验证可行性，随后产品逻辑继续围绕本地 Tool 接口增长，协议层没有升级成独立 Adapter。
- **建议方向：** 以官方 MCP TypeScript SDK v1.x 替换自写 transport/parser，并把 `McpConnectionManager`、`CapabilityRegistry`、`ActionPolicy`、`McpResultNormalizer` 设为清晰 Interface；v2 在当前日期仍处预发布阶段，不作为生产基线。Azure DevOps 优先验证官方 remote Streamable HTTP connector，保留本地 stdio 作为受管回退。
- **验收条件：** 见 `RA-075` 至 `RA-080`；规范细节见 [Agent / MCP / 开源复用架构](./agent-mcp-reuse-architecture.md)。

### MP-016：Agent 架构与开源复用缺少强制边界

- **场景：** 团队继续修复 Agent 循环、执行时间线、PR review、Composer 和 workspace 问题。
- **实际表现：** 仓库已经 vendored OpenHarness、Azure DevOps MCP、PR-Agent，并依赖 assistant-ui、Radix UI、CodeMirror 等组件；但具体迭代仍容易直接在现有大模块中追加条件、复制状态或重新实现通用基础设施。
- **预期行为：** 每个改动先判断是产品差异化逻辑还是通用能力；通用能力先查本仓库依赖、`third_party` registry 和维护活跃的开源实现，通过稳定 Interface/Adapter 接入，产品只保留策略、状态和审计等核心差异。
- **用户影响：** 继续局部修补会放大 Agent、Chat、Workflow 与功能页的状态耦合；同一个工具调用可能拥有多个 UI 表示和多个持久化来源，回归成本持续上升。
- **严重度：** P1。
- **证据索引：** 用户补充要求；结合 `docs/third-party-source-reuse.md`、`docs/agent-architecture-alignment.md` 和当前 package dependencies 的源码审计。
- **当前源码状态：** 已存在 `packages/core`、`packages/daemon`、`apps/desktop` 的基础分层和 source-first reuse registry；OpenHarness 的 approval pattern 已被移植，assistant-ui 已通过本地 adapter 使用。问题不是“没有架构”，而是缺少针对新工作的复用优先闸门、稳定 execution event source 和明确的 module ownership。
- **可能原因：** 早期功能以纵向交付为主，适配层和协议层深度不足；文档提出过复用方向，但没有变成 Definition of Ready、测试要求和 review checklist。
- **建议方向：** 以 `AgentRuntime`、`CapabilityRegistry`、`ActionPolicy`、`ExecutionEventStore`、`ArtifactStore` 和 domain resolver 为深模块；禁止 UI、planner 和持久化各自推导 tool state。建立 `Adopt / Port / Reference / Reject` 四级复用决策和 license/provenance/update 流程。
- **验收条件：** 见 `RA-081` 至 `RA-086`；目标分层、候选仓库和复用闸门见 [Agent / MCP / 开源复用架构](./agent-mcp-reuse-architecture.md)。

## 5. 安全与证据处理

原始 Word 包含疑似历史凭据及可识别的组织和个人信息。后续工作应遵守：

1. 在任何 issue、PR、测试 fixture 或截图中不复制原始敏感值。
2. 由凭据所有者确认相关历史凭据是否仍有效；若无法确认，按已暴露处理并轮换。
3. 生成测试数据时使用显式占位符，例如 `example-org`、`example-repo`、`***REDACTED***`。
4. 自动化日志与 artifact 应继续复用项目现有 redaction 路径，避免再次将 secret 写入 Chat 或报告。

## 6. 证据限制

- 截图来自用户提供的手动测试材料，并非本次重新操作应用时捕获。
- 本次已核对截图内容和当前源码，但没有对生产 ADO 做写操作。
- 当前源码存在不等于已发布安装包包含该能力；标记为“当前版本部分解决”的项目必须在最新构建复测。
- 截图只能暴露部分可访问性风险；键盘、焦点、screen reader、缩放和颜色对比仍需按回归矩阵验证。
