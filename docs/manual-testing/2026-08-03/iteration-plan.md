# MergePilot 手动测试问题迭代计划

> 日期：2026-08-03。输入为 [手动测试问题分析](./manual-test-findings.md)，Agent/MCP/复用设计见 [Agent / MCP / 开源复用架构](./agent-mcp-reuse-architecture.md)，逐项验证见 [回归验收矩阵](./regression-acceptance-matrix.md)。本文件是工程拆分建议，不代表任何项目已完成。

## 1. 计划原则

- 先恢复安全与核心接入，再修工作流语义，最后统一交互和视觉。
- 一次纵向切片同时完成 domain contract、daemon runtime、typed event、UI、持久化和回归，不只修表面提示。
- 通用能力执行“复用优先”：先查现有 dependency、`third_party` 和 reuse registry，再决定 Adopt、Port、Reference 或自研。
- 每次迭代减少事实源和兼容分支；不得以增加另一套局部状态作为完成。
- 所有“当前版本部分解决”都必须用最新桌面构建复测后才能改为已修复。

## 2. 优先级与依赖关系

| 波次 | 工作包 | 问题 ID | 依赖 |
| --- | --- | --- | --- |
| P0-A | 敏感材料处置与 OAuth 恢复 | MP-001 | 无 |
| P1-A | Typed failure、MCP 协议与 capability 地基 | MP-010、MP-011、MP-015 | P0-A 的 OAuth 状态契约 |
| P1-B | Pipeline target 与功能页状态隔离 | MP-006、MP-010 | P1-A |
| P1-C | Agent loop、证据和执行时间线 | MP-002、MP-003、MP-004、MP-016 | P1-A 的 typed event/call ID |
| P1-D | PR 产品模型与写回边界 | MP-009 | P1-A、P1-B |
| P2-A | Session、Environment 与 File workspace | MP-005、MP-007、MP-008 | P1-C 的 event/artifact model |
| P2-B | Project Link、字体与排版系统 | MP-012、MP-014 | shared UI primitives |
| P2-C | Composer 与图片轻编辑 | MP-013、MP-016 | assistant-ui adapter、Markdown round-trip PoC |

建议严格保持上述主依赖；P2 的视觉 token 设计可以提前，但不应抢先改动大量页面，避免在执行信息架构变化前重复返工。

## 2.1 实施状态（不伪造完成；每项以对应测试和构建证据为准）

| 波次 | 状态 | 证据 | 剩余验证 |
| --- | --- | --- | --- |
| P0-A（MP-001） | 已实现 | `adoDiagnostics.test.ts`、`adoOauthRecovery.test.ts`（api + 状态机）、`ProjectLinkAdoSection.test.tsx`；core 315 / desktop 749 测试通过；desktop typecheck+build 通过 | 真实 OAuth 浏览器流程、declined 与过期 token 的桌面 smoke（自动化不能替代） |
| P1-A 之一（MP-011 typed failure） | 已实现 | `failures.test.ts`（11）、`chatSse.test.ts` 终端映射（14）、`useChatRuntime.test.ts`；daemon 304 / core 全量通过；core 重新构建供 daemon 消费 | 真实 Stop/timeout 桌面 smoke；resume/retry 执行机制随 P1-C 补齐 |
| P1-A 之二（MP-015 MCP + CapabilityRegistry + ActionPolicy） | 已实现 | `mcpSdkAdapter.test.ts`（9：lifecycle/分页/list_changed/cancel/structured）、`capabilityActionPolicy.test.ts`（10）、`mcpTools.test.ts`（6，fixture 改为官方换行 framing）、`chatSessionAdoMcpDisabled.test.ts`（4）；core 345 / daemon 304 通过 | 真实 connector（managed Azure DevOps MCP stdio）smoke；RA-080 远端 token 过期恢复随 P1-C 恢复机制联动 |
| P1-B（MP-010 PipelineTargetResolver + MP-006 状态隔离） | 已实现 | `pipelineTargetResolver.test.ts`（10：ID/唯一名/重名/不存在/无权限/connector/capability/选择恢复）、`serverAdoWorkflowRoutes.test.ts`（5，含 typed not_found 与 session 隔离断言）、`PipelineRowCard.test.tsx`（13，含 target_failure 各状态）；core 355 / daemon 305 / desktop 753 通过，desktop build 通过 | 桌面真实交互 smoke：歧义候选选择、Open in Chat 导航；重名场景真实 ADO 复测 |
| P1-C（MP-002 调用去重 + MP-003 证据分层 + MP-004 执行时间线） | 已实现 | `toolCallDedup.test.ts`（8：fingerprint 规范化/等价抑制/失败重试/状态变化）、`chatPlannerEvidence.test.ts`（15，不再硬编码 Verified facts）、`FinalEvidencePanel.test.tsx`（2）、`chatSse.test.ts`（16，含 evidence 与 exitCode）、`TurnTranscript.test.tsx`（6，RA-013 折叠 + RA-014 exit code）、`chatTurnTranscript.test.ts`（20）；core 365 / daemon 307 / desktop 761 通过 | 真实模型循环 smoke（重复调用抑制可见性）；attempt 链恢复（RA-007/RA-015/RA-052/053）随 P1-C 恢复机制与 P1-D 审批联动复测 |
| P1-D（MP-009 Insight/Review Run/Queue 边界 + ADO 写回） | 已实现 | `WriteBackConfirmationPanel.test.tsx`（5：写回目标/内容/审批文案）、`serverReviewDispositionWritebackRoutes.test.ts`（3，含 audit actor 服务端推导）、`PullRequestCard.test.tsx` 标签更新；daemon 308 / desktop 765 通过；insight-preview 路由确认无 review run 副作用 | 真实 ADO 写回 smoke（RA-041 目标/审批/结果展示）；Review Run 版本化记录与 attempt 链随真实评审复测 |

敏感材料处置：本迭代未向文档、fixture、日志或 Chat 写入原始测试材料中的凭据、账号、内部地址、UUID、头像或本机路径；测试数据一律使用 `example-org`、`example-project`、`C:\repo\example` 等占位符。

## 3. P0-A：敏感材料处置与 OAuth 显式恢复

**覆盖：** `MP-001`。

**目标：** 用户不需要离开应用或输入命令即可完成 Azure DevOps 授权；疑似暴露的历史凭据不继续流转。

**受影响模块：** Project Link form runtime、ADO discovery API wrapper、OAuth enable endpoint、auth state store、Project Link ADO section、redaction/audit。

**数据流：**

```text
discovery request
→ typed unauthorized(authStatus, retryContext)
→ inline recovery action
→ user click
→ browser OAuth
→ callback/health confirmation
→ retry original discovery once
```

**拆分顺序：**

1. 由凭据所有者核实并轮换原始材料中疑似历史凭据；不把值放入 issue 或日志。
2. 让 API wrapper 保留结构化 `authStatus`、provider、recoverable 和 retry context，不再只抛 plain `Error(message)`。
3. 在 Project Link 中增加用户触发的 `Enable Azure DevOps access` / `Re-authorize`，禁止 organisation 输入事件自动打开浏览器。
4. 授权成功后只自动重试原 discovery 一次；失败后保留用户输入和诊断信息。
5. 补正常、拒绝、关闭浏览器、过期、重复点击和恢复回归。

**主要失败模式：** 循环弹浏览器、授权回调未关联原请求、成功后重复 discovery、secret 写入 session/history、用户拒绝后被当成内部错误。

**Definition of Done：** `RA-001` 至 `RA-004` 通过；错误 UI 有明确恢复操作；成功恢复不需要命令行；没有敏感值进入文档、fixture、Chat 或日志。

## 4. P1-A：Typed failure、MCP 协议与 capability 地基

**覆盖：** `MP-010`、`MP-011`、`MP-015`。

**目标：** 用标准 Adapter 处理 MCP，用同一错误 taxonomy 区分未启用、未授权、target 歧义、timeout、Stop、内部失败和 tool error。

**受影响模块：** `packages/core/src/tools/mcp.ts`、capability registry、ToolExecutor、daemon connector lifecycle、SSE/Chat event、Project Link connector settings、error notice/tool card。

**复用决策：**

- Adopt 官方 [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) v1.x；当前 v2 仍需等待稳定版和兼容验证。
- 对官方 [Azure DevOps MCP](https://github.com/microsoft/azure-devops-mcp) 做 remote read-only PoC；local stdio 保留受管回退。
- Port OpenHarness typed event/approval 的适用行为，保留 zod v3/v4 wrapper boundary。

**拆分顺序：**

1. 先定义 `AgentFailure`、`ToolFailure`、`ConnectorFailure` 与 UI recovery action，不使用 message substring 作为状态源。
2. 以 SDK-backed `McpConnectionManager` 替换手写 frame/parser；覆盖 version/capability negotiation、stdio newline framing、分页、list change、cancel、structured result。
3. 扩展 `CapabilityRegistry`：记录 connector、server/tool 原名、domain、schema、read/write、risk、idempotency、auth state。
4. 把 ActionPolicy 放在 native 与 MCP adapter 之前，tool annotations 只能做提示，不能提升信任。
5. 稳定 `callId` 从 planner 贯通 daemon、SSE、UI、persistence 和 audit。
6. 实现 failure → recovery 映射，并按回归矩阵验证。

**主要失败模式：** server 与 client version 不兼容、工具分页漏项、tool rename 后缓存未刷新、cancel 只关闭 UI 不取消调用、write tool 被误判为 read、malformed result 污染 Chat、connector 失败后静默换路径。

**Definition of Done：** `RA-042` 至 `RA-054`、`RA-075` 至 `RA-080` 通过；所有 connector/tool failure 有类型；写操作保持审批；MCP transport/parser 不再由产品代码自行实现。

## 5. P1-B：Pipeline target resolver 与页面状态隔离

**覆盖：** `MP-006`、`MP-010`。

**目标：** Pipeline 页面能解析唯一 target，并把结果保存在自己的 run state；只有用户明确选择 `Open in Chat` 时才创建或关联 Chat session。

**受影响模块：** pipeline workflow、Project Link pipeline metadata、ADO/MCP adapter、Pipeline page store、session metadata、navigation intent。

**数据流：**

```text
Pipeline page action
→ PipelineTargetResolver
→ unique target / candidate list / typed failure
→ PipelineRun record
→ Pipeline page result
→ optional explicit Open in Chat handoff
```

**拆分顺序：**

1. 定义 `PipelineTarget`（stable ID、display name、project、source）与 resolver contract。
2. 覆盖显式 ID、唯一名称、重名、无权限、不存在和 connector domain 缺失。
3. 去掉“存在 sessionId 就 append assistant bubble”的隐式耦合；功能页结果写入 domain run record。
4. 实现显式 handoff，写入 session metadata 的 source/run reference，不复制敏感或大 payload。
5. 对 Pipeline 与 PR/Insight 的跨页面状态做隔离回归。

**主要失败模式：** 用名称猜 ID、不同 project 同名、旧 session 被污染、切换 Project Link 后沿用旧 target、retry 创建重复 run。

**Definition of Done：** `RA-021` 至 `RA-024`、`RA-042` 至 `RA-048` 通过；页面操作无隐式 Chat 副作用；歧义必须由用户选择。

## 6. P1-C：Agent loop、结论与执行时间线

**覆盖：** `MP-002`、`MP-003`、`MP-004`、`MP-016`。

**目标：** Agent 只为推进目标获取证据；工具调用、进度、证据和最终结论有清晰分层。

**受影响模块：** planner guards、tool loop、evidence model、finalization、typed execution event store、Chat transcript、tool group/collapse、Activity persistence。

**复用决策：** Port OpenHarness 的 typed events/tool middleware/approval 模式；复用 assistant-ui tool/approval primitives；不引入第二套完整 Agent runtime。

**拆分顺序：**

1. 定义 normalized tool-call fingerprint（tool + target + canonical args + relevant repo state）。
2. 同一 turn 内禁止无新状态的等价调用；重复需要显式 reason 与 retry attempt。
3. 增加 evidence budget 和 stop conditions：已有足够事实、不可恢复阻塞、用户 Stop、deadline、tool budget。
4. 删除硬编码 `Verified facts:`；final response 只陈述结论、差异和下一步，详细证据通过 call/artifact 引用展开。
5. 用 `ExecutionEventStore` 驱动 running、progress、completed、failed、cancelled 与嵌套 group；父组折叠必须连带子组。
6. 把 OpenHarness/assistant-ui 复用决策记录到 registry，并删除被替代的局部状态。

**主要失败模式：** 参数顺序导致去重失效、状态变化后被错误去重、tool output 与 assistant text 错位、完成后仍显示 running、折叠只隐藏父标题、final 重复完整输出。

**Definition of Done：** `RA-005` 至 `RA-016`、`RA-081` 至 `RA-083` 通过；同一事实只有一个执行来源；日志可展开但默认不淹没结论。

## 7. P1-D：PR 产品模型与受控写回

**覆盖：** `MP-009`。

**目标：** Insight、Review Run、Review Queue 和 ADO writeback 的副作用边界在 UI、数据和权限上完全一致。

**产品决策：**

| 表面 | 职责 | 持久化 | 远端副作用 |
| --- | --- | --- | --- |
| Insight | 当前 PR 的无副作用预览与解释 | 可缓存 artifact，不建正式 review record | 无 |
| Automated Review / Review Run | 执行完整评审并产生版本化记录 | Review Run + findings + evidence | 默认无；结果可进入 Queue |
| Review Queue | 人工处置、审批策略、finding decision | audit record、actor、decision | 仅明确确认后受控 ADO 写回 |
| ADO | PR complete/abandon 等生命周期操作 | ADO 自身记录 | 本轮仍在 ADO 完成 |

**受影响模块：** PR insight API/store、Review Run、Review Queue、ADO mutation adapter、permission/approval、copy/navigation。

**拆分顺序：** 先固化 domain entities 与副作用表，再统一 UI 命名；最后接受控写回和审计。不要先改按钮文字再补数据模型。

**主要失败模式：** Insight 隐式建 run、重复 finding、Queue 决策未记录 actor、writeback 重复提交、页面与 ADO 状态不同步。

**Definition of Done：** `RA-035` 至 `RA-041` 通过；任何远端写入都有目标、参数、actor、审批与结果；Insight 无副作用。

## 8. P2-A：Session、Environment 与 File workspace

**覆盖：** `MP-005`、`MP-007`、`MP-008`。

**目标：** Session 标题来自用户目标；Environment 与 File workspace 都有明确入口、状态机和恢复路径。

### Session 标题

- 新 session 第一条用户消息落库后生成标题；排除 tool output、assistant fallback 和敏感文本。
- 后台异步生成失败时使用清理后的用户首句；允许用户手动改名，手动标题不被覆盖。
- 验收：`RA-017` 至 `RA-020`。

### Environment

- 明确 `not configured / checking / ready / degraded / blocked`。
- 每项检查给出状态、原因、修复动作和重新检查；不把可恢复项只显示为红色文本。
- 验收：`RA-025` 至 `RA-028`。

### File workspace

- 空状态说明如何从 Chat tool output、repository tree 或 artifact 打开文件。
- 统一 loading、too large、binary、missing、permission denied 和 success。
- 复用现有 CodeMirror、Markdown/Mermaid renderer；不为每个页面重写 preview。
- 验收：`RA-029` 至 `RA-034`。

**Definition of Done：** 三类状态可通过 URL/session reload 恢复；File artifact 不依赖 Chat bubble payload；标题、环境和文件错误不泄露敏感值。

## 9. P2-B：Project Link 组合框与字体排版系统

**覆盖：** `MP-012`、`MP-014`。

### Project Link 组合框

- 复用现有 Radix primitives 或项目内统一 Combobox adapter，不继续扩展 native `<select>`。
- 支持键盘、搜索、空状态、loading、清除、长名称截断与完整 tooltip。
- 保留 accessible name、focus ring、Escape/Enter/Arrow 行为。
- 验收：`RA-055` 至 `RA-059`。

### 字体方案

以当前左侧导航的节奏作为正向基准，不引入外部网络字体。

```css
--font-ui: "Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI",
  "PingFang SC", "Noto Sans CJK SC", sans-serif;
--font-mono: "Cascadia Mono", "SFMono-Regular", Consolas, monospace;
```

| 角色 | 建议字号 / 行高 | 字重 | 使用范围 |
| --- | --- | --- | --- |
| Navigation item | 13 / 20px | 500 | 左侧主导航、二级入口 |
| Navigation group | 11 / 16px | 600 | 仅分组标签；允许大写与有限字距 |
| Page title | 20 / 28px | 600 | 页面主标题 |
| Section title | 15 / 22px | 600 | 卡片/区块标题 |
| Body | 14 / 22px | 400 | 中英文正文、表单内容 |
| Supporting | 12 / 18px | 400 | 说明、时间、次要 metadata |
| Status label | 12 / 16px | 500 | 状态 chip、短标签 |
| Code / command | 12.5 / 19px | 400 | 代码、命令、路径、branch、commit hash |

约束：非代码 ID、普通时间、状态、按钮和导航不得使用 mono；全大写字距只用于 navigation group；Windows 100%/125%/150% 缩放必须无裁切。

**Definition of Done：** `RA-068` 至 `RA-074` 通过；页面不再自行发明相同语义的字号组合；浅色、标准、深色主题层级一致。

## 10. P2-C：Composer 与图片轻编辑

**覆盖：** `MP-013`、`MP-016`。

**目标：** 在保留现有 Markdown + structured image attachments 接口的前提下，复用成熟编辑器与附件 primitives，完成选择、粘贴、拖放、编辑、删除、超限和发送展示。

**复用决策：**

- 优先扩展现有 [assistant-ui Composer](https://www.assistant-ui.com/docs/primitives/composer) adapter 的 attachment、dropzone、send/stop/focus 状态。
- 编辑内核推荐 [Tiptap](https://tiptap.dev/docs/editor/getting-started/overview) 开源核心和 image extension；消息仍序列化为 Markdown。
- `@tiptap/markdown` 当前为 Beta，必须先验证 Markdown → editor → Markdown 往返，覆盖 GFM、代码块、链接、列表、中文和已有消息编辑。[Markdown 说明](https://tiptap.dev/docs/editor/markdown)
- 图片第一阶段采用 [react-easy-crop](https://github.com/ValentinH/react-easy-crop) 做 crop、zoom、rotate 和重新上传；不纳入标注、滤镜或完整图片工作台。

**拆分顺序：**

1. 建 Markdown round-trip compatibility fixture 和 attachment contract test。
2. 用 assistant-ui primitives 接管 attachment lifecycle，同时保持现有 API payload。
3. 接入 Tiptap headless bridge；若 round-trip 不达标，先只升级 attachment/composer shell，不强行替换文本编辑器。
4. 加图片编辑 modal，所有转换在发送前完成；超限、格式、尺寸和内存失败必须可恢复。
5. 删除旧的重复 attachment state，只保留一个 owner。

**主要失败模式：** Markdown 语义丢失、粘贴重复添加、data URL 过大、编辑后附件 ID 改变、发送中可再次发送、图片删除后仍进入 payload。

**Definition of Done：** `RA-060` 至 `RA-067`、`RA-084` 至 `RA-086` 通过；旧消息显示兼容；失败不会丢失正文草稿。

## 11. 问题到交付物追踪

| 问题 | 主要交付物 | 回归范围 |
| --- | --- | --- |
| MP-001 | typed auth error + inline OAuth recovery | RA-001–004 |
| MP-002 | call fingerprint、budget、stop conditions | RA-005–008 |
| MP-003 | evidence/final 分层 | RA-009–011 |
| MP-004 | typed execution timeline + nested collapse | RA-012–016 |
| MP-005 | user-goal session title | RA-017–020 |
| MP-006 | domain run state + explicit Chat handoff | RA-021–024 |
| MP-007 | Environment state machine | RA-025–028 |
| MP-008 | unified File/Artifact workspace | RA-029–034 |
| MP-009 | PR surface domain model + controlled writeback | RA-035–041 |
| MP-010 | PipelineTargetResolver | RA-042–048 |
| MP-011 | failure taxonomy + recovery mapping | RA-049–054 |
| MP-012 | accessible searchable Combobox | RA-055–059 |
| MP-013 | composer/attachment/editing adapter | RA-060–067 |
| MP-014 | semantic typography tokens | RA-068–074 |
| MP-015 | SDK-backed MCP adapter + capability contract | RA-075–080 |
| MP-016 | reuse gate + deep module boundaries | RA-081–086 |

## 12. 发布门槛

- 所有 P0/P1 正常、失败、恢复路径通过；P2 至少完成目标平台与缩放组合。
- 没有 issue 使用截图作为“已修复”的唯一证据；必须有最新构建运行结果。
- 没有新增内部 URL、账号、UUID、头像、本机绝对路径或凭据进入 fixture、日志和文档。
- 新 dependency/source copy 已登记 license/provenance；新 Adapter 有 contract tests 和退出策略。
- Chat、功能页、Activity 对同一 workflow 的状态一致，且没有未授权副作用。
