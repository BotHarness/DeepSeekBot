# Bot 级自动审批策略

状态：Human 于 2026-11-15 确认的目标设计，分片实施中。本文档不改变运行行为。[English](bot-approval-policy.md)。

[ADR-0342](../adr/0342-bot-approval-selects-one-template-and-keeps-deterministic-authorization-separate.md) 记录长期决策与权衡，本文整合目标行为；GitHub issue 记录交付状态。设计确认不授权实施功能、更改运行权限或推进 SQLite 迁移。

实施首片 #4211 通过既有文件 owner、认证 Host、在线 CLI 和 Client Select 打通全局／Bot 选择及两结果版本化 Review。三部分编辑、规则统一表和确认后的批量删除回退由后续切片交付。

## 一份有效模板

Profile 有一个可选的全局默认模板，来源是共享 Approval Template 库。每个 Bot 明确选择一种状态：

| Bot 选择     | 有效 Reviewer 策略                              |
| ------------ | ----------------------------------------------- |
| 继承全局     | 动态使用全局当前选择；不复制、不叠加 Bot 额外行 |
| 特定模板     | 使用该共享模板，完整替换全局模板                |
| 关闭自动审批 | 不使用模板 Reviewer                             |

多个 Bot 可以选同一份模板。切换全局选择影响继承它的 Bot；编辑共享模板影响所有实际使用它的 Bot。使用另一份特定模板或关闭的 Bot 不受影响。全局未选模板时，继承它的 Bot 停用 Reviewer。

关闭 Reviewer 不撤销确定性授权，也不改变 Full Access。

新 Bot 默认继承；既有 Bot 保持原有特定模板或关闭状态，不能把旧数据的缺省字段自动解释为启用继承。本次只确认兼容语义，不选择存储格式或迁移方案。

## 三部分自然语言与 Reviewer 结果

每份模板包含逐条自然语言 Always ask、逐条自然语言 Always allow、free text。它们帮助 Reviewer 理解行为，不是 Bash 正则、通配表达式或确定性谓词。

给 Reviewer 的指导是：Always ask 优先于 Always allow；free text 补充判断，不取消前两部分的要求。覆盖不清、未覆盖或无法确定时交给 Human。模型可能理解错误，因此这些名称不构成“现实中符合描述的行为必定被识别”的硬保证。

模型只有两个结果：

- allow：仅批准当前请求，不生成可复用授权。
- ask-human：展示 Human 审批卡，由 Human 批准或拒绝。

目标取消模型自主 reject，原先由模型拒绝次数触发的熔断及恢复逻辑不再适用。既有拒绝历史是实现证据，不代表本目标已经交付。

## 确定性授权与效果准入

先由代码判断行为是否需要审批，再处理有效的确定性授权；已覆盖的请求不调用 LLM。未覆盖时使用有效模板 Reviewer；未启用 Reviewer 则交给 Human。

Full Access 本身不豁免 [E2 #4210](https://github.com/BotHarness/DeepSeekBot/issues/4210) 所指的不可撤销外部调用审批。具体效果声明与准入机制仍属于 [E1 #4205](https://github.com/BotHarness/DeepSeekBot/issues/4205)、E2 与 [E4 #4212](https://github.com/BotHarness/DeepSeekBot/issues/4212)，本次不实施，也不声称能从任意命令文本可靠推断其全部行为。

卡片 Always allow 保存的 Tool Approval Rule 是确定性授权，继续绑定具体 Bot、角色、授权范围及执行检查。在 Always allow 表格共同展示时，必须标注“来自卡片”、作用范围及撤销入口；共同展示不改变两类条目的执行方式。它不写入共享模板，不授权使用同模板的其他 Bot，也不随模板复制。已经命中确定性规则时，模板中的自然语言不会覆盖它；需要重新审核时，由 Human 撤销该规则。

当前所有权、Workspace Grant、设备目标及授权撤销检查独立于模型判断。生效中的策略管理跳过 Reviewer 与 Full Access，须由 Human 决定，或使用 ADR-0249 独立管理范围中确实覆盖该操作的显式已保存授权。旧普通规则不因此获得管理权限。管理审批展示受影响的 Bot。

## 显式创建、编辑和删除

创建时，用户显式选择“从零创建”或“基于已有模板创建”，后者明确选择来源，得到独立副本，不保留持续继承关系。保存时明确区分“仅保存”和“保存并用于当前 Bot”；创建本身不切换 Bot 选择。

编辑共享原件与创建新模板必须显式区分；不能根据当前 Bot 页面隐式复制，也不能把局部编辑悄悄传播给其他 Bot。

删除使用二次确认，列出受影响 Bot 及删除后的有效选择，不要求用户逐个解除引用：

| 引用关系               | 确认删除后的结果                            |
| ---------------------- | ------------------------------------------- |
| Bot 明确选择被删模板   | 将该 Bot 改为继承全局                       |
| 全局选择被删模板       | 清空全局默认选择                            |
| Bot 继承全局           | 保持继承；若删的是全局默认，则停用 Reviewer |
| Bot 使用其他模板或关闭 | 保持原选择                                  |

如果全局仍选另一份模板，回退继承的 Bot 随即使用它，确认信息必须说明这一结果，而不只是说“删除模板”。删除不撤销确定性授权，不改变 Full Access。

## Review 快照与失败

每次 Review 开始时固定所用模板身份、版本和内容。编辑及选择切换影响之后开始的 Review；已开始的 Review 可以按旧版本完成，记录保留当次身份与版本。该快照不豁免实时所有权、范围、Grant 和已撤销授权的执行检查。

所选模板缺失或无法读取、模型不可用、超时、返回格式错误，均将当前请求交给 Human 并显示原因；不自动允许、不换另一模板、不改写 Bot 或全局选择。主动未选全局模板不是加载失败。确认删除后的回退是显式管理操作，不是故障恢复。

## 与现有规格及代码的差异

静态核查基线为 fc29d448467392b1e9ed2f3d048d3d1df0b14381，不是 live Host 验证：

| 事项       | 原有事实或规格                                                 | 本次确认目标                                       |
| ---------- | -------------------------------------------------------------- | -------------------------------------------------- |
| 模板选择   | Bot 单个可选字段，plugin.ts:2491 无全局默认层                  | 继承全局／特定模板／关闭                           |
| 模板结构   | ADR-0207 为整段 Markdown；#4203、E3 为三部分加 Bot 额外行      | 一份选定模板的三部分，不叠加 Bot 层                |
| 模型输出   | approval-reviewer.ts:189 为 allow/reject/ask-human             | 仅 allow/ask-human                                 |
| 确定性顺序 | tool-approval.ts:306–349 先 Full Access、保存规则，再 Reviewer | 保留确定性授权优先，同时保留 E2 改变效果准入的方向 |
| 卡片规则   | #4203、E3 AC-3 要求保留确定性执行及来源标签                    | 延续，并保持 Bot 归属                              |
| 引用中删除 | 本次访谈前尚未确定                                             | 二次确认后统一回退继承，删除默认时清空全局         |

代码来源：[Bot 记录](../../packages/core/src/bots/persona-bot.ts)、[模板查找](../../packages/core/src/plugin.ts)、[Reviewer](../../packages/core/src/workspaces/approval-reviewer.ts)、[审批 owner](../../packages/core/src/workspaces/tool-approval.ts)、[规则](../../packages/core/src/workspaces/tool-approval-rules.ts)。ADR-0205／0207／0239／0249 记录演进，不能单独把 ADR-0207 当作当前完整管线。

2026-11-15 核查时，[#4203](https://github.com/BotHarness/DeepSeekBot/issues/4203)、E1、E2、[E3 #4211](https://github.com/BotHarness/DeepSeekBot/issues/4211)、E4 均 open、无 assignee、全部评论为 0。所查证据未发现认领记录或新范围的可核实实施 PR，但不能据此断言绝无实施。本机 gh 未认证，未确认 timeline 事件的完整性。旧模板 Reviewer 与卡片规则已有合并前身，例如 PR #1835、#2739。访谈未创建、认领或编辑任何 issue／评论。

本次修改 #4203／E3 的模板组合关系及既有 Reviewer 结果集合；延续三部分编辑方式、卡片规则来源展示和 E2 方向。后续应在现有规格协调差异，不创建重复 issue。本设计不推进 SQLite 迁移 #4227；性能 PR #4228 独立，未修改或监控。

## Claude Code 研究边界

本 worktree 的 .claude/settings.json 只有 Bash(pnpm evidence:publish:_) 与 Bash(pnpm evidence:check:_) 两项 allow，无项目级 ask、deny、hooks、defaultMode。这仅是项目文件事实，不代表用户、managed 或运行时有效配置；未输出秘密。

2026-11-15 查阅的官方 [permissions 文档](https://code.claude.com/docs/en/permissions.md#manage-permissions) 区分执行配置与自然语言指导，按 deny、ask、allow 顺序判断，并将 Bash 模式描述为通配语法，而非正则。[Memory 文档](https://code.claude.com/docs/en/memory.md#claude-md-vs-auto-memory) 将 CLAUDE.md 定义为上下文。[Auto mode 配置](https://code.claude.com/docs/en/auto-mode-config.md) 另有自然语言 hard_deny、soft_deny、allow，与确定性权限及 Shell allow 的处理分开。这些字段及 Claude 专属优先级只是研究来源，不是 BotHarness API，也不提供模型判断的硬保证。未复核 Claude Code 引擎源码或有效运行配置。

## 访谈决策溯源

- Q1–Q3：替换而非叠加；Bot 三态；模板为自然语言指导。
- Q4–Q7：共享库复用；模型仅两个结果；确定性规则优先；全局未选时停用继承的 Reviewer。
- Q8–Q10：自然语言优先级；保留 E2 对 Full Access 的效果准入；每次 Review 固定版本。
- Q11–Q13：失败转 Human；卡片规则归 Bot；保持管理授权边界。
- Q14 及补充：Human 将隐式复制定制改为显式选择从零或基于模板创建，并确认仅保存／保存并应用。
- Q15：Human 将禁止引用中删除改为二次确认，告知影响后统一回退继承，避免逐个解除引用。
- Q16–Q18：保持既有 Bot 选择；模型放行不存规则；删除全局默认时清空全局。
- 最终确认：Human 确认完整汇总后，才开始写入设计文档。

## 确认与交付边界

Human 在 Q1–Q18 分轮访谈后确认了完整汇总；原设计树无未决产品分支。实现机制、CLI 契约、版本表示、持久化格式与迁移留待实施任务，不在本文偷偷作决定。既有应用定义的审批 owner 仍持有决定权；不新设另一套权威，不替换 DSH-native approval/request、Session 或 API Gateway seam。

后续交付须验证：继承／特定／关闭的有效选择；冲突及不确定转 Human；确定性命中时没有 LLM 调用；卡片规则只授权所属 Bot；删除结果披露及回退；Review 固定版本；故障转 Human；无有效管理授权时拒绝策略变更。这是未来验收要求，不是已实现或已通过测试的声明。

性能评估：本次只有文档变更，无新依赖、无运行热路径变化，因此免运行性能基准。未来 E2／E3 须分别预算新增准入工作及模型调用，证明确定性命中不调用 Reviewer，并依仓库性能规则验证实际旅程。

#4244 的三部分编辑沿用模板文件 owner 与 32 KiB 有界读取；使用 ADR-0342 记录的 v1 内容表示，旧 Markdown 完整映射为补充说明。复制只复制内容；保存与应用分开，编辑共享原件显示全局继承者在内的使用者。编辑仅影响后续 Review。

## Human 审批结果展示

Reviewer 转交时，先向同一 canonical Channel 写入显式 `ask-human` 结果，再创建 Human 请求，保留 Review 起始模板身份、版本、已脱敏输入和原因。记录失败仍转 Human；取消或 owner 改变不能授权。历史自动拒绝记录继续可读，旧拒绝覆盖入口不能接受新的 `ask-human` 记录。

Web 与移动端的 Human 审批卡在允许这次、始终允许或拒绝后保留完整请求内容，仅操作区变为已选中、禁用的结果。决定前打开的详情保持打开，历史卡在重载后仍可查看完整内容。移动端从现有 Channel 消息投影已验证的只读请求内容，不逐卡增加历史或状态请求；缓存内容不能提供决定权限。历史内容缺失或格式无效时如实显示不可用。
