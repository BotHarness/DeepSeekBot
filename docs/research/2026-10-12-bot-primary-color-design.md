# PersonaBot 主色系统：设计访谈

日期：2026-10-12（Asia/Tokyo）  
状态：设计已由 Human 确认（Q1–Q11）。首个切片 #1471（保存自动／自定义主色、Profile 设置与 DM 作者名）已实现，其余切片尚未实现；下文“当前实现观察”与“交付边界”记录的是设计定稿时的状态。

实现规格已发布为 [Spec #1469](https://github.com/BotHarness/DeepSeekBot/issues/1469)，标记 `ready-for-agent`；本文件保留设计访谈和验收依据，不是另一份实现规格。

Human 已确认六个实现切片：协调 hub [#1470](https://github.com/BotHarness/DeepSeekBot/issues/1470) 管理 #1471（设置与 DM）、#1472（群聊）、#1473（分享导入）、#1474（删除后归属）、#1476（用量图表）和 #1475（活跃度）；Hub 与六个子 Issue 均归属 Project #12，并按 Human 确认绑定 Milestone 1.2.2。源规格正文、标签和状态保持不变。

规范术语已同步 `CONTEXT.md` / `CONTEXT.zh.md`，持久取舍记录于 [ADR-0177](../adr/0177-bot-primary-color-is-portable-identity-not-theme-state.md)，目标边界整合进 [living architecture](../architecture/botharness-architecture.md) §5.5。下列记录保留访谈与验收细节，不是另一份架构权威。

## 已确认的产品决策

1. 自动主色跟随当前 Avatar 的主发色，不永久固定为初始头像颜色。历史消息和历史图表使用当前主色，不为每条消息或每个统计时间点保存颜色快照。
2. 同一来源色派生不同用途的语义色。Avatar 本身不随主题变色；名字文字和图表线条、填充、活跃度深浅分别适配 light/dark 和实际背景，尽可能保持原色相。名字文字以至少 4.5:1 的对比度作为设计验收目标，不要求各用途或主题的色值完全相同。
3. 不要求不同 PersonaBot 的主色唯一。同色时通过名字、Avatar、图例，以及适用的线型或标记区分，不因当前图表的排序或参与者改变主色。
4. 首版覆盖群聊输入中的已选 Bot 提及、提及候选列表中的 Bot 名、已发送的 Bot 提及、群聊和 DM 的 Bot 消息作者名，以及按 Bot 区分的图表系列、图例、tooltip 身份标记和单 Bot 活跃度色系。正文和整个 bubble 背景不染色；模型、token 类型、成功/失败等分类或状态保留自己的语义。所有 Bot 提及、Human 名字和 Channel 引用保持中性色，不扩展到外部 IM 客户端。
5. 所有 PersonaBot 均可选择自动（默认）或自定义主色。自定义指定来源色，之后改名、改发色或换头像不覆盖它；恢复自动重新采用当前头像的自动来源，而非创建时的颜色。手动色同样需要按用途和主题派生，不保证最终文字与选中的色值完全相同。
6. 多色头发使用 pixel avatar recipe 的主 `hairColor`，不对最终图片统计像素面积，也不随姿势、动画、帽子或局部发色变化。
7. 不对上传图片自动取色。自定义图片、无发头像、line family 和没有可用主发色的旧外形数据采用基于 PersonaBot ID 的确定性兜底色，用户可手动覆盖。上传图片不强制选色；同一 PersonaBot 的兜底色不因页面或改名变化。黑、白、灰等有效主发色不视为缺失，通过主题适配处理可读性。分享/导入保留已有兜底来源，见第 10 项。
8. PersonaBot 删除后保留删除前最后的主色来源，历史消息和统计归属继续按主题派生；没有颜色的旧历史归属采用 PersonaBot ID 兜底。这是最后的身份呈现，不是逐消息或逐时间点的颜色快照。
9. Bot Profile 的头像/外观区域提供独立的 Bot 主色设置：自动/自定义、少量预设、颜色选择器和 HEX 输入，不做完整调色板编辑器。局部预览 Avatar、Bot 提及、消息作者名和图表色样，可切换 light/dark。保存成功后聊天和图表更新；取消不改已保存设置；保存失败保留草稿并提示，不向其他界面发布。自动模式说明当前来源。不要求顺带重构现有头像上传流程。
10. 主色随分享/导入携带：自定义模式保存模式和来源色；自动发色模式从携带的外形派生；自动兜底模式携带原兜底来源，即使导入生成新 PersonaBot ID 也不变色，且仍然是自动模式。新建且没有携带来源时按 ID 生成兜底；未来出现可用主发色时自动模式仍跟随它。不携带 light/dark 派生色，目标环境重新计算。
11. 以 Bot 为主要比较对象的图表使用各自主色，token 子类使用该色系的固定明暗层级、固定顺序、标签和 tooltip；以 token 类型或模型为主要比较对象时保留分类色，Bot 主色用于关联的名字或身份标记。单 Bot 活跃度以主色色阶表达强度，零值保持主题中性色；错误/告警保留状态色。Human/Bot/Other 聚合不错误地使用某个 PersonaBot 的主色。

## 已确认术语

- **Bot Primary Color / Bot 主色**：用于识别同一 PersonaBot 的视觉身份来源色，而非主题品牌色或运行状态色。默认采用当前 Avatar 的主发色或稳定兜底色；Human 可以独立于 Avatar 指定自定义来源色。正式定义见根 glossary；该定义是产品语言，不是实现或发布声明。
- **名字色、图表色**：来源色针对用途、主题和背景派生的呈现，不是另一套可独立配置的身份。

## 当前实现观察

- `packages/client/src/client/avatar.tsx` 的 `PersonaBotAvatar` 优先使用支持的保存 Appearance；没有保存 Appearance 且没有 image media 时，按 Display name（为空时使用 PersonaBot ID）和 seed version 生成默认外形。
- ADR-0148 规定：未编辑外形的默认 Avatar 跟随名字；保存后的 Appearance 不因改名变化。自动主色必须与实际显示外形采用一致的来源选择，不能另写一套不同的默认头像算法。
- `packages/core/src/bots/avatar-appearance.ts` 重新导出 BotPixel recipe 和配色能力；line family 使用 `inkColor` / `backgroundColor`，不具有主发色。
- 消息作者名在 `packages/client/src/client/bot-main.tsx` / `styles.ts` 中使用通用文字 token。提及显示和输入编辑分别在 `channel-message-body.tsx`、`rich-mention-editor.ts` 中渲染，需要共享颜色规则。
- `packages/client/src/client/profile-chart-theme.ts` 已提供读取主题 token 并响应主题属性变化的机制。主色系统须与主题适配共存，不应把 Avatar 数据色当作新的全局品牌 token。
- `channel-activity-chart.tsx` 当前按 Human / Bot / Other 聚合，不能把聚合的 Bot 类别错误地标成某个 PersonaBot 的主色。
- `overview-usage-view.tsx` 的 Bot 用量列表会保留非 current 的统计归属；其 `UsageChart` 复用 `model-usage-charts.tsx`，后者颜色当前表达 token 类型。第 11 项确认了目标组合编码，不代表现有图表已完成主色接入。
- `profile-header.tsx` 的 `AvatarModal` 包含 Avatar 编辑和图片上传入口；`avatar-appearance-editor.tsx` 已有 Appearance 草稿、Save/Cancel。第 9 项定义新增主色设置的保存边界，不假定现有上传图片操作与 Appearance 草稿已经是同一事务。
- `packages/core/src/bots/bot-zip-http.ts` 的导入路径生成新 PersonaBot ID。第 10 项要求携带既有兜底来源来维持视觉身份；现有导入代码尚未实现这个主色合同。

这些是工作区源码观察，不是运行时或视觉验收证据。

## 验收场景

| 场景                                                         | 预期                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 默认 pixel Avatar、保存外形、未保存外形的改名                | 自动主色解析与实际 Avatar 来源一致；历史显示跟随当前颜色                         |
| 修改主发色、仅修改侧发或配饰、活动动画                       | 主发色修改更新自动主色；局部颜色和临时动画不改变身份来源                         |
| 设置自定义后改名、改发色、换图片                             | 自定义来源保持；恢复自动采用当前 Avatar 来源                                     |
| 上传图片、无发、line、未知或旧外形数据                       | 不采样图片，不强制选色；稳定兜底，不因页面和改名变化                             |
| 黑、白、灰、浅黄和饱和色；light/dark 与实际消息背景          | Avatar 不变色；名字达到 4.5:1 目标；图表仍可读且与同一身份相关                   |
| 打开设置、切换模式、取消、保存失败、保存成功、刷新/Host 重启 | 只有成功提交改变身份；失败保留草稿；成功设置可恢复；其他 Client 重读保存事实     |
| 同色 Bot 与图表参与者/排序变化                               | 不重新分配身份色；用名字/Avatar/图例及适用的线型或标记区分                       |
| 输入中提及、候选列表、已发送提及、群聊和 DM 作者名           | 同一 Bot 使用统一名字色；正文、bubble 背景、Human、Channel 与全部 Bot 提及不染色 |
| Bot 用量比较与 token 子类、模型/类型比较                     | Bot 主色与固定 token 色阶遵循主要比较维度；顺序、标签和 tooltip 保留子类含义     |
| 单 Bot 活跃度、零活动、错误/告警、Human/Bot/Other 聚合       | 强度使用主色色阶；零值中性；状态及聚合类别不误标为 Bot 身份                      |
| 自动发色、自定义、自动兜底的分享/导入                        | 保留模式和视觉身份；新 ID 不改变携带的兜底来源；主题变体不持久化或传输           |
| 删除 Bot、旧历史无色、当前 Bot 改色                          | 删除保留最后来源；旧历史稳定兜底；存在的 Bot 历史采用当前色，没有逐条快照        |

以上均是待验证的验收要求，不是已执行测试或视觉证据。

## 交付边界

设计决策前沿已收敛；算法常量、数据字段、迁移和桥接签名由实现时的源码与 Host 验证决定，不继续作为无事实依据的产品问答。已发布 Spec #1469 和经 Human 确认的实施 hub／六个 tickets；未领取 implementation claim、创建 PR、运行功能测试或修改运行代码。后续 issue-backed 实现须遵守现有 claim、tracer bullet、主题实测与 Human-QA 工作流；保存、历史、分享和所有约定的名字/图表表面未验证前，不宣称完整功能已交付。
