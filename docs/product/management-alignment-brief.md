# MergePilot 产品方向澄清与下一阶段建议

状态：管理层决策简报
日期：2026-08-05
用途：澄清此前设计开发偏差，确认下一阶段投资边界并征求管理层建议

## 一、管理结论

MergePilot 仍值得继续开发，但不应再定位为通用 Coding Agent、AI Git
客户端、Azure DevOps 桌面复制品或单一 PR Review 工具。

建议统一定位为：

> **MergePilot 是 local-first 的 Azure DevOps Delivery Copilot：连接本地代码与
> ADO 的 Work Item、PR、CI、测试和部署证据，提出受控操作，并在写回 ADO 后
> 重新读取和验证结果。**

当前只承诺完成产品简化和一条真实端到端闭环；后续扩展必须由试点结果决定。

## 二、此前设计开发偏差

此前方案偏向“按 ADO 资源建设页面”和“在聊天中增加更多 Agent 工具”，导致：

- Pull Requests、Review Queue、Pipelines、Activity 和 Chat 存在重复入口与状态。
- `Generate insight` 与 `Run automated review` 重复表达同一个用户目标。
- Project Link 承担 branch、pipeline、MCP 和运行状态，边界过重。
- Pipeline/PR 操作把报告预加载进 Chat，结构化工作流与对话相互污染。
- MCP 被当作用户需要安装和管理的产品功能，而不是内部能力传输层。
- 开发进度按页面和功能数量衡量，没有证明完整 ADO 结果是否真正闭环。

这些问题不是局部 UI 缺陷，而是产品对象、信息架构和成功标准不统一。

## 三、市场与竞争现实

单点能力已经高度商品化：

- Microsoft Azure DevOps MCP 与 GitHub Copilot 覆盖 Work Item、Repos、PR、
  Pipeline、Test Plan 和 AI Review。
- CodeRabbit、Qodo 等产品已覆盖 Azure DevOps PR Review、风险发现、修复建议和
  Work Item 合规检查。
- Harness AI 覆盖 CI/CD、故障分析、测试、发布和治理，但更偏向完整平台替换。
- 用户现有的 ADO Portal + IDE + Git 工具 + 脚本仍是最主要的替代方案。

因此，ADO 聊天、普通 PR 总结、Git 操作封装和 MCP 工具数量都不是可持续优势。
仍有机会的组合切口是：**本地仓库证据 + ADO Delivery Graph + 审批治理 +
写回验证 + 中断恢复**。

## 四、权威产品范围

### 保留并重点建设

- 五个结果导向入口：`Agent / Work / Changes / Delivery / Settings`。
- Context 作为唯一 Project Link 选择入口；Project Link 只保存稳定身份映射。
- Work Item → branch/commit → PR → build/test → deployment 的交付关系图。
- `Proposal → Approval → Execution → Re-read → Verification` 的统一操作路径。
- 公开、可恢复的 Turn 时间线，以及本地 Git 与 ADO 证据关联。
- 一个版本化 Review Brief，而不是多个 insight 类型。

### 移除或合并

- 独立 Review Queue；保留 Changes 内的 `Your turn` 投影。
- Activity 主导航；审计记录进入可搜索 History/Audit。
- 重复 PR insight、Pipeline 点击后自动生成 Chat 报告。
- Composer 和页面级 Project Link 选择器。
- Project Link 中的 branch、pipeline、MCP 和 Git 状态字段。
- 面向用户的 MCP 安装、注册、目录和市场。

### 暂缓

- 通用 Coding Agent 平台和多个外部 Agent 选择器。
- 全量 Boards、Pipelines、Test Plans 或 Deployment 门户复制。
- 外部 AI Reviewer 集成、管理层健康仪表盘和多平台扩张。

## 五、建议的下一阶段

### Cycle 00：产品重置与安全基础

- 统一 Turn、Artifact 和 Action 的权威数据路径。
- 完成审批、幂等、取消、恢复和写回验证。
- 删除重复导航、重复 insight 和旧双渲染路径。
- 分离客户端延迟、模型 TTFT、工具和 ADO 请求耗时。

### Cycle 01：证明一条黄金路径

在隔离的真实 ADO fixture 中完成：

```text
Work Item
→ 本地分支和变更证据
→ PR 准备与创建
→ CI 跟踪和故障处理
→ ADO 状态/关系写回
→ 权威重新读取和结果验证
```

Cycle 01 通过后，再根据证据决定是否投资 Changes、CI/Test、Work
Intelligence 和 Deployment Readiness。

## 六、管理层需要确认的事项

1. 是否认可收缩后的 ADO-first、local-first Delivery Copilot 定位。
2. 是否允许删除已投入但与新定位冲突的重复页面和旧数据路径。
3. 是否同意先只投资 Cycle 00–01，而不承诺完整功能路线。
4. 是否能够提供 3–5 个真实 ADO 团队或代表用户参与试点。
5. 是否认可用结果指标而不是功能完成率作为继续、调整或停止依据。

## 七、继续投资的证据门槛

下一阶段应至少证明以下三项：

- Work Item 到可审查 PR 的准备时间明显缩短。
- CI 失败到可信下一步行动的时间明显缩短。
- 错误、重复或过期 ADO 写入低于通用 Agent 工作流。
- 用户能理解操作依据，并能确认远程状态已经按预期改变。
- 试点团队在四周内重复使用完整闭环，而不是只体验一次 AI 输出。

若相比 `ADO Portal + Copilot/MCP + IDE` 没有可测量优势，或团队不愿增加
桌面工作层，应停止扩展并重新评估产品必要性。

## 参考依据

- [MergePilot 产品战略](strategy.md)
- [竞争格局与市场判断](competitive-landscape.md)
- [产品范围与信息架构](scope-and-information-architecture.md)
- [Delivery Graph 与 Verified Action Runtime](delivery-graph-and-action-runtime.md)
- [Outcome Roadmap](outcome-roadmap-2026.md)
- [Microsoft Azure DevOps Remote MCP](https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops)
- [GitHub Copilot Code Review](https://docs.github.com/en/copilot/concepts/agents/code-review)
- [CodeRabbit Documentation](https://docs.coderabbit.ai/)
- [Harness AI Overview](https://developer.harness.io/docs/platform/harness-ai/overview/)
