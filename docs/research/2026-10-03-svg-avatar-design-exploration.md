# PersonaBot 可组合 SVG Avatar：设计探索

日期：2026-10-03。状态：`grill-with-docs` 访谈完成，Human 已在 Q20 确认完整设计；本文件保留研究与选择依据，规范目标见 [Accepted ADR-0118](../adr/0118-editable-avatar-appearance-is-independent-of-activity.md)，**不代表功能已实现或获实施授权**。

设计探索阶段只授权调研、提问与工作流文档。Q20 确认后，Human 另行授权提交设计文档、创建 PR 和准备本地 `/to-spec` handoff；仍没有功能实现、发布 spec 或合并授权。文档 PR 追踪 [#743](https://github.com/BotHarness/BotHarness/issues/743)，本地继续入口见 [handoff](2026-10-03-svg-avatar-to-spec-handoff.md)。

## 工作流与证据口径

已读取仓库 AGENTS.md、`grill-with-docs`、其组合的 `grilling` 与 `domain-modeling`，以及 `dsh-plugin-dev` 的 Context/Decision Tree 和 `dsh-ui`。事实探索按 grilling 要求先后委派了状态来源、视觉参考两个只读探索 Agent；用户决策由本 Session 收集。

首轮 checkout 为 `main@9325ac2cdc13177f2682ca6ce6a25a24052d1527`，存在既有未提交改动，本次保留原有内容。活动状态事实首轮另核验到已合并的 `c943506bf58da24aa339cc14e3c6af548ae396d6`（2026-10-03，PR #731）；最终刷新到 [`c3349cdcb82f9f57ae29fcbd72e3e7e88247ab11`](https://github.com/BotHarness/BotHarness/commit/c3349cdcb82f9f57ae29fcbd72e3e7e88247ab11)（2026-10-03 07:04:25Z）。下列状态源文件与前一 baseline 相同，Overview 的 #737 已合并，详见状态段更新。本地旧 checkout 的表现不能直接代表当前 main。

产品术语使用根 CONTEXT：PersonaBot 是持续身份，Agent 是单个 Session 的执行器；Avatar 是跨 Binding 的共享视觉表达；Bot state 是执行事实的 presentation，不是 mood。DSH 的 SessionEvent/Projection/Service/Typert/API Gateway 是平台 seam；捏脸配方、角色家族、部件协议、姿态与动作映射都是 application-defined。

Q9 与 Q11 确认后，已将 Avatar Family（形象家族）写入双语 CONTEXT，并按公共词汇表文档规则补充双语 Release Ledger；仅记录产品术语，不声明功能已交付。Q20 已确认完整方案：[Accepted ADR-0118](../adr/0118-editable-avatar-appearance-is-independent-of-activity.md) 将保存外形、活动事实与动画呈现的归属明确分开，Avatar Appearance（保存外形）已补入双语 CONTEXT，并集成到 living architecture 的待交付设计目标。没有进入实现。

## 已确认与问题 frontier

| 问题                      | Human 答复                               | 对后续设计的约束                               |
| ------------------------- | ---------------------------------------- | ---------------------------------------------- |
| Q1：小头像与大形象优先级  | 两个场景同等重要                         | 同一身份必须分别通过侧栏辨认与放大表现验收     |
| Q2：开放 SVG 部件上传     | 希望最终开放，首版先用预设               | 首版受控资产；设计可扩展协议，但不加入上传平台 |
| Q3：角色本体              | 首版就同时支持多种角色家族               | 不能假定只有一个人物或机器人 rig               |
| Q4：“模式”的含义          | 真实工作类型，造型保持一致               | 不因工具切换覆盖保存外形，不推断性格或情绪     |
| Q5：工作与需要 Human 并存 | 工作动作＋独立的需要你提示               | execution 与 attention 同时表达，不互相覆盖    |
| Q6：首批视觉参考          | Notion Faces；Grokbot 和 ChatGPT Dots    | 参考已选，具体家族边界与原创视觉仍待澄清       |
| Q7：跨家族共享动作        | 按建议：共用语义与过渡，每个家族适配动作 | 不强迫不同拓扑使用同一几何模板                 |
| Q8：首切片结果动画        | 按建议：先执行与 attention，结果动作随后 | 首切片不需要推断完成／成功／出错               |

第四轮已确认：Q9 人物插画＋抽象小角色两类，各自原创视觉；Q10 首版脸部、视线与整体姿态，不要求身体／手势；Q11 家族内组合，少量配件明确适配后共享。

第五轮已确认：Q12 简洁插画／轻体积感即可，不要求绒毛；Q13 **希望大幅变形，甚至变成点阵或符号**；Q14 **首版就要细分发件和五官几何编辑**。后两项替代此前轻微形变、整发预设优先的建议，必须评估其组合成本，不能按较窄方案继续。

第六轮已确认：Q15 配件可以暂时收起，保存造型不变、复原后完整恢复；Q16 细分部件＋丰富几何参数，不直接编辑路径／自由绘制；Q17 点阵／符号主要用于工作类型切换的短过渡，稳定姿态恢复角色本体。

第七轮已确认：Q18 小头像克制、大形象更丰富；Q19 保存有版本配方＋派生静态快照，缺部件／协议版本时保留配方、用快照保住原外形，并明确暂不可编辑／播放角色动画。

产品决策 frontier 已清空。Q20 Human 答复“准确，确认这份设计”，完整方案的共享理解已达成；不是新增实现授权。以下“收敛方案”明确提出技术候选、交付顺序和仍需实际验证的条件。

后续验证依赖：已选家族 → 构图/部件兼容边界/美术生产；上传远期目标 → 部件包版本/许可/导入校验；动作契约 → 过渡中断/未知与断连/结果作用域；共享外形 → 导入与 clone 验证。具体图稿、参数范围和预算仍需实际测量，不能冒充已验收实现。

## 已确认的收敛方案

| 层面           | 已确认目标与方案建议                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 角色           | 两个原创 Avatar Family：Notion Faces 启发的人物插画，以及 Grokbot／Dots 启发的抽象小角色；清晰插画与轻体积即可，无绒毛要求                                                                                                     |
| 捏脸           | 家族内组合；人物五官、头型及前／后／侧发等细分部件，颜色自由选，位置／大小／间距／倾斜／发长／弯曲等丰富参数在兼容范围内调整；抽象家族只暴露其适合的形体与部件，不强塞鼻嘴；少量配件明确适配后共享                             |
| 动作           | 脸部、视线、整体姿态；两个家族共用工作语义与过渡规则，各自适配动作；抽象角色可短暂大幅变为点阵／符号，配件暂收起、恢复本体后完整回来                                                                                           |
| 小／大图       | 都需独立 Human 验收；小头像动作更短、更克制、大图更丰富，稳定姿态保辨认性；静态特征与工作提示同样清晰，不靠放大效果替代小图验收                                                                                                |
| 真实状态       | 首切片 idle／thinking／working 与现有 searching／coding／executing／generic-working 效果；工作动作与需要 Human 的独立提示并存；不推断等待 Assignment，不用 idle 或 turn/end 伪造成功；结果动作随后                             |
| 保存           | PersonaBot owning module 持有版本配方、派生静态快照和当前选择；编辑在 local draft 中即时预览，显式 Save/Cancel，Host 验证后原子保存；没有 browser-local 第二身份库                                                             |
| 版本           | 部件 ID 与 family/asset/rig/schema 版本明确；缺版本保留原配方，用静态快照展示原外形并说明编辑与角色动画暂不可用；不静默换部件；Activity Frame 的真实活动提示仍可用                                                             |
| 渲染           | 优先验证现有 React Client 中受控 inline SVG、稳定 DOM；普通动作采用浏览器 transform／opacity，有必要的几何使用有界姿态采样；不是逐帧重建整套 SVG，也不是逐帧 React state／RPC／SessionEvent；未选外部动画库                    |
| 分享           | 本地保存不自动写 Memory 或发布；显式准备分享时，按 #17 合同将配方／presentation／资产或快照写入 committed metadata。fresh identity 仍保持已分享外形，git pull 不自动覆盖本地偏好；整套 Profile 恢复归 #76                      |
| 安全           | 首版受控资产，输入仅稳定 ID／有界数字／合法颜色；复用 bounded raster fallback； SVG defs 按实例隔离，不引入脚本／外部资源／任意属性字符串；未来上传有单独的几何子集、兼容和资源预算合同                                        |
| 退化与生命周期 | 复用既有 motion policy；reduce 下无装饰循环和大形变，文字／独立提示保留。hidden／不可见／卸载停止采样。断连展示同步不可用、停止误导性的持续装饰动作，不把最后已知事实改成 idle／成功／失败；freshness 当前需要 Client 合同补足 |

静态快照是配方的派生物，绑定外形 revision 并遵守现有 512×512／解码 ≤128 KiB 图片预算；精确字段、内容 URL 和缓存合同尚未实现。一次 canonical 保存包含关联配方与快照，不将快照另立为可编辑外形权威；列表和状态刷新只传轻量信息，避免重复传字节。

资产制作先提供每个家族的一组最小兼容样本，覆盖差异明显的五官、头形和发件及一项配件；数量由视觉评审决定，不从参考产品照搬部件总数。部件的“保存位置／几何”与“状态姿态变换”分层，状态不能覆盖用户设置；极端参数必须仍满足根部接合、遮挡、裁切和全部支持动作。若组合不兼容，编辑器说明冲突并限制该组合，不 silently 变回默认。

实施顺序只作为后续授权时的计划：首先一个家族完成编辑→保存→重读→Roster／Profile 同一形象→真实工具活动与独立 attention→重启／重连恢复的窄纵向切片，并作 Human 验收；首切片通过 #123 owner 已交付的合同验证工作与需要 Human 并存，合同未可用时明确依赖，不能将 attention 推迟到第二家族之后或自行推断来源。第二家族复用该语义合同证明异构适配，两者都属于首版范围，再扩展几何组合检查。点阵短过渡、极值参数兼容与缺版本回退属于首版行为，不被推迟成“以后再做”。#123 的 attention 合同是已有 owner 依赖，不另行开发另一套来源。

验证要求：真实 Host 链路与双主题 Human 评审；两家族各有 small／large 视图；保存、取消、恢复与缺版本保持外形；合法参数极值及组合冲突；快速切换连续性和固定粒子容量；同 Bot 多实例 SVG ID 无碰撞；reduce、hidden、断连与释放；recipe 导入/round trip 和恶意格式校验。性能要在目标浏览器记录真实帧时间、内存及资产体积，以 1／8／32 个同时可见活动头像作为起始压测梯度，扩到真实使用上限；这些是建议验证规模，不是已通过指标。性能不达标时先减少装饰复杂度与不可见采样，保持真实状态提示。

剩余是实现前验证而非未询问的产品选择：具体原创图稿、part 数量、Rig 参数范围、每种工具效果的姿态、exact DTO／migration、受控资产生成和跨浏览器性能。最终确认这份方案也只完成设计，不授权功能实现、push、PR、发布或合并。

## 当前实现与边界

### Avatar 与持久化

- 当前统一 `PersonaBotAvatar` 已覆盖 Blobatar 与图片。Blobatar markup 来自受控生成器，图片失败则回退；外层接收 state/effect/activity，并提供可访问说明。见 [已合并 Avatar renderer](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/client/src/client/avatar.tsx#L130)。
- 自定义图片是 `avatar` 字段中的有界 PNG/JPEG/WebP data URL，解码上限 128 KiB，有 magic-byte 嗅探；不接受 SVG 和远端 URL。读取通过认证 route 与 ETag，不把 base64 塞入 roster 刷新。见 [ADR-0086](../adr/0086-custom-personabot-avatars-are-bounded-data-urls.md)、[已合并 validator](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/bots/persona-bot.ts#L71)、[#58（CLOSED）](https://github.com/BotHarness/BotHarness/issues/58)。捏脸配方不能冒充这个图片字段已支持的格式。
- 当前 Registry 仍读写 `bot.json` 并原子替换。见 [Registry](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/bots/registry.ts#L103)。[ADR-0041](../decisions/persistence.md#adr-0041) 是 operational database 的目标边界；不能在研究中把目标 SQLite 迁移写成现有事实，也不能擅自新建一套配方 store。
- Profile view 现有 64px 头像用于编辑；并非已有大型角色舞台，甚至这里不传活动 state。[Profile view](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/client/src/client/personabot-profile.tsx#L288)。小／大形象同等重要仍需要具体 Human 可检视的构图验证。

### 执行与 attention

| 想表达的行为                   | 已核验来源／边界                                                                                                    | 本探索可做的推论                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| thinking / working             | DSH typed SessionEvent；tool/call 开始，tool/result 按 call ID 移除；turn/step 边界清理                             | 可以消费共享 Projection；不自行解析模型文本                           |
| searching / coding / executing | 已合并的安全 tool-kind 映射；多个不同 kind 折叠 generic-working                                                     | 表达当前观察到的工具活动，不声称知道任务目标                          |
| 多 Session                     | Session Ownership 和 descendant attribution；active Orchestrator 通常独占共享 presentation，否则聚合 owned Sessions | Avatar 消费 owning module 的聚合，不另造排序与归属                    |
| 需要 Human 确认                | 实际 active native question/approval request ID ＋未解决条件；Assignment typed report/open ask                      | 是独立 attention；共享 Avatar 合同仍由 #123 owner 推进                |
| Orchestrator 等待 Assignment   | **无既存 declared Host source**                                                                                     | 不从文本、approval、后台 Assignment 活动或 idle 推断                  |
| 完成／成功                     | turn/end 只对应 done                                                                                                | done ≠ Assignment 成功 ≠ 全 Bot 工作完成                              |
| 出错                           | Assignment Runtime 有恢复 error 等事实，但 shared Avatar aggregate 没有通用 error/result DTO                        | 先明确哪个工作、是否仍有效，不能 idle→成功或 blocked→执行错误         |
| 未知／断连                     | Client generation/revision 防旧快照、gap refetch、SSE 重试；仍保留最后已知状态                                      | 当前不能声称已有 freshness/unknown 合同；不让陈旧信息无限表演“仍在忙” |

证据：[SessionEvent activity](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/state/dsh-activity.ts#L15)、[pending tools](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/state/dsh-activity.ts#L109)、[安全 tool kinds](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/state/tool-activity.ts#L102)、[Bot projection](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/state/bot-state.ts#L109)、[snapshot 合同](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/state/bot-state.ts#L309)、[native attention](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/runtime/human-attention.ts#L107)、[Assignment attention](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/core/src/runtime/human-attention.ts#L174)、[Client reconnect](https://github.com/BotHarness/BotHarness/blob/c943506bf58da24aa339cc14e3c6af548ae396d6/packages/client/src/client/activity-live.ts#L120)。

最终刷新时，[#737](https://github.com/BotHarness/BotHarness/pull/737) 已于 2026-10-03 06:46:28Z 合并（[`1819596c`](https://github.com/BotHarness/BotHarness/commit/1819596c84ff474d7663558944908a305eb86283)），见 [owner 完成记录](https://github.com/BotHarness/BotHarness/issues/123#issuecomment-5966478364)。最新 main 的 [Overview bridge](https://github.com/BotHarness/BotHarness/blob/c3349cdcb82f9f57ae29fcbd72e3e7e88247ab11/packages/core/src/bridge/methods.ts#L1210) 消费共享 execution/activity，Human action 保持独立 `hasAction/actionCount`，pending approval/question 不再改写 execution 或隐藏 live root。但 [共享 Activity DTO](https://github.com/BotHarness/BotHarness/blob/c3349cdcb82f9f57ae29fcbd72e3e7e88247ab11/packages/core/src/state/bot-state.ts#L309) 仍无 attention 字段；上述 state/Client 文件与首轮 baseline 相同。

[#123 owner](https://github.com/BotHarness/BotHarness/issues/123#issuecomment-5966444126) 正推进独立 native tool approval attention 切片，[#740](https://github.com/BotHarness/BotHarness/pull/740) 本轮仍 OPEN（head `32cd0c87fd909004b51dfa8ee5f1459602a92349`）。提案是 `attention?: { approvalCount: positive integer }`，从 broker 在 Channel commit 后发布、decision/abort/disposal 清除、重启不从历史卡恢复；它不是已合并的共享能力。questions、其他 attention axes 和 explicit waiting-on-Assignment 仍在后续 #123；[禁止推断等待的明确记录](https://github.com/BotHarness/BotHarness/issues/123#issuecomment-5965624849) 仍适用。本探索不接管 owner 工作。

## 参考真正支持什么

[Notion 官方说明](https://www.notion.com/help/notion-faces) 支持从脸部／发型／配件组合人物并下载。它支持组合交互的参考价值，没有证明我们能直接使用其图稿或共享动作协议。[制作方 BUCK](https://buck.co/work/notion-faces) 记录了系统视觉对齐、不同肤色和配件组合检查；这说明美术兼容性是专门的生产工作，不仅是一个编辑器。

Human 在第三轮指定 Notion Faces、Grokbot 与 ChatGPT Dots 的形象作为首批参考；没有指定下载它们的图稿。第四轮已确认落为人物插画与抽象小角色两类，各自做原创视觉。

[Grok Bot 官方设计文章的 motion 段落](https://x.ai/bot/guides/designing-grok-bot-with-grok-bot#motion-god-work-with-the-real-thing) 在本次核验时包含圆润紫色角色与两只深色眼睛的生产动作场景图，讨论真实 animation spec 下的 timing、springs、distance、scale 与 easing。它支持整体姿态与动作节奏的参考，但没有公开该 spec、可组合部件协议、状态表或运行技术；社区 SVG 复刻不能代表官方实现。此前 ADR-0032 指出的“工作流文章不是公开头像设计规格”边界仍适用，不把本轮图片观察写成上游接口保证。

[Dots 官方页面](https://chatgpt.com/features/dots/) 的匿名页面在本次只读观察中可切换角色，合影可见蓝色戴贝雷帽、黄色戴眼镜、紫色心形戴墨镜和绿色双突眼角色。[官方帮助](https://help.openai.com/en/articles/20001530-getting-started-with-your-dot) 描述选择 characters 或 pet，也可能生成 pet。公开视觉资料可得；可以观察绒毛质感、体积光影、不同轮廓，但不能据此推断 SVG、3D、Spine、开放部件编辑器或真实状态合同。两只眼睛的位置与附属物不统一，也不支持“所有参考都能使用同一人物部件槽位”的假设。

**已确认的材质目标**：人物保持清晰插画，抽象角色采用简洁轮廓，可有轻微渐变与体积感，不要求 Dots 的绒毛。这允许继续比较受控 SVG 路线，但相似效果的资产成本与实际表现尚未测量。本轮未找到 Grok/Dots 角色图稿的公开复用许可，不将品牌规范或社区代码许可等同角色资产授权；候选仍是原创造型与受控素材。

[EmoteLab General Requirements](https://emotelab.app/docs/preparing-models/general-requirements/) 描述 Spine 骨架、slots、skins、atlas 与 textures；[Skins](https://emotelab.app/docs/preparing-models/skins/) 定义部件分组与 required/default-on/default-off；[Animations](https://emotelab.app/docs/preparing-models/animations/) 将动作与用户 slot 颜色区分，动作中的 slot color keyframes 不生效。借鉴的是固定造型＋兼容部件＋动作的分工，不能把它当一个现成 SVG 动画包，也不据此预选 Spine。

本机未提交的 `prototype/avatar-hair` 明确是 throwaway、不得生产导入，已有 SVG 姿态、层序、跨中断采样探索；`prototype/avatar-three` 是并列技术探索。它们以及未提交的头发／three.js research 都是历史候选证据，不是 Human 已确认的风格、角色家族或性能结果，也不属于本次 PR 交付物；其他 checkout 不应依赖这些文件存在。

## 对原建议的挑战与候选选择

| 原假设                                   | 挑战                                                                     | 暂建议，尚未定案                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 分层 SVG 就能任意组合                    | 刘海遮眼、眼镜碰鼻、头型变宽、长发穿肩都需要美术兼容；统一画布不能解决   | 每家族声明层序、头部/眼部/颈部锚点、遮挡与裁切、安全动作范围，部件携带兼容标签                                   |
| 全家族统一锚点和 transform center        | 不同拓扑、关节、眼距及重心不同；随着发型 bounding box 改变，中心也会漂移 | 共用状态语义；每个家族有自己的 rig contract 和姿态映射，兼容范围内复用动作                                       |
| 发型需要多个可编辑片段                   | 自由拼前／后／侧发增加穿插与组合成本；侧栏尺寸可能没有识别收益           | Human 已选首版细分发件与五官几何编辑；需设计有界参数与组合兼容，不能仅用整发预设替代                             |
| 先头肩像                                 | 小头像通常只容纳脸；大图如果需要手势，只有头肩可能不够                   | 等首批家族和表现目标确认后，在现有座位尺寸与放大图上分别验证裁切                                                 |
| 五态互斥：待机/处理中/等待确认/完成/出错 | 工作与 attention 可并存；结果是事件/工作事实，非永久人格状态             | 已确认工作＋独立 attention；结果动作在后续切片另行定义作用域与新鲜度                                             |
| 表情淡入淡出总能自然                     | 两套眼睛/嘴同时半透明可能成为重影；切换过程中又来事件还会跳              | 对姿态数值插值；表情离散切换优先考虑眨眼/遮盖的短过渡，少量形状才使用 crossfade                                  |
| SVG path morph 谨慎即可                  | 任意不同发型/五官路径未必可插值，拓扑差异可能自交                        | Human 已选抽象角色可大幅变成点阵／符号；大形变不自动要求任意路径 morph，可评估参数化姿态、有界粒子或作者预制拓扑 |
| 小头像安静、大头像丰富                   | Human 已要求两者同等重要；安静不能变成小头像没有身份和状态可辨性         | 同语义、不同动作幅度；静态特征先可辨，rich motion 是否必要由视觉评审决定                                         |

SVG 的变换参考框必须明确，不能仅依赖 `transform-origin: center`：`fill-box` 与 `view-box` 引用不同边界，见 [MDN transform-box](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/transform-box)。具体 rig 更适合以固定坐标锚点表达，不随可见发型外框漂移。这是设计推论，尚无跨浏览器视觉验证。

### 大幅形变与几何编辑的组合

Human 已要求两者同时进入首版，不能把它们拆成“首版静态捏脸、以后才研究点阵”。但“保存造型不因工作类型改变”仍成立：保存的选项与参数可以不变，当前呈现姿态可以暂时变成另一种拓扑。

追加只读原型核验：`prototype/avatar-hair/app.js` 用 64 个径向样本表示一个连续轮廓（L46、L202），每帧生成 body path（L701）；thinking 的点姿态把主轮廓缩成中央点并另加两点（L493），burst 另有五个预制点（L425）。它没有证明一个任意轮廓能原生拆成多个不连通点。

头发的固定头空间锚点经过视线旋转、投影与半径缩放（L380），仍依赖可解释的头部。非 baseBody 姿态下的隐藏／强制显示策略（L1211、L1735）是实验，强制显示会让点也长头发。Human 已在 Q15 接受挂点失效时暂时收起配件，复原后完整恢复；不修改已保存配置。

原型可以捕获当前混合姿态处理切换中断（L610），但其点混合把旧、新列表拼接（L538），没有稳定点 ID 配对与总数上限；过滤透明点不等于限制保存在混合姿态中的点数。原型还会用 innerHTML 重建眼洞、头发和点（L1195），每根发束有多段投影计算（L796）。这些是需要修正或替代的探索证据，不是生产资产。

| 候选                             | 适配要求与成本                                                                            | 当前结论                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 参数化姿态＋独立有界点阵／符号层 | 配方保留；家族解释有界几何参数；点有固定容量与稳定 ID；部件明确普通姿态挂点和缺失挂点策略 | 优先验证的候选，支持大形变，不承诺任意 SVG 都能 morph        |
| 作者预制同构路径 morph           | 每种可变眼／嘴／轮廓提供兼容路径与参数范围；几何编辑仍需在兼容区间内                      | 可用于局部形状；不是未来上传部件的默认保证                   |
| 所有部件逐件粒子化               | 几何采样、点归属、颜色及重组映射；不同发件复杂度改变点数与成本                            | Q15 已接受配件收起，首版没有为保留每件饰物而选择此路线的必要 |

[SVG 2 路径规范](https://www.w3.org/TR/SVG2/paths.html#TheDProperty) 对平滑 `d` 插值要求命令数量、类型和顺序兼容。大形变可以用独立姿态层表达，不必须依赖跨拓扑 path morph；这是设计推论。Human 在 Q17 选择点阵／符号主要用于短过渡；进入稳定活动姿态时恢复已配置角色，不把一团点阵作为整段工作中的持续身份形态。

细分发件已有实验 UI（L1362），没有完整人物五官编辑协议。Human 已在 Q16 确认丰富参数编辑足够；仍需定义前／后／侧发组合、根部锚定、眼间距和位置范围、遮挡与裁切，并验证合法极值能执行全部支持姿态。用户选项应在保存前实时预览；暂建议明确保存后才写入 owning module，未保存的预览不变成 durable authority。

## 数据、导入导出与安全候选

建议评估一种有版本的受控配方：family/pack/rig 版本、稳定 part IDs、颜色值和有限参数。它描述身份外形，执行事实与动画时间不写入配方。Service Definition/Provider 仍由 PersonaBot owning module 承担，Client 通过现有 Typert/API Gateway 操作。状态更新消费共享 Projection；每帧姿态是 Client presentation，不追加 SessionEvent、不做逐帧 RPC。

替代方案是只保存最终图片（安全且直接兼容现有流程，但丢失可编辑性与部件动作），或保存任意 SVG markup（开放自由度高，但必须承担可信边界、资源预算与版本兼容）。Human 已确认首版预设，因此优先比较“版本配方＋受控资产”与“配方＋静态快照回退”；不能提前决定持久 schema。

首版即使不开放上传，也应验证 part ID、family compatibility、颜色 grammar、参数范围和整体大小；颜色不能作为任意 CSS/SVG 属性字符串。受控资产的局部 `<defs>` ID 必须按渲染实例隔离，同一个 Bot 在侧栏、消息与 Profile 同时出现不能碰撞。可编辑文字也不能进入未经转义的 SVG markup。现有受控 Blobatar 使用 innerHTML 并不授权将任意上传内容送进同一路径。

未来开放部件上传需要单独决定：只接受几何数据或受限 SVG 子集、禁止可执行元素与事件处理器/foreignObject/外部资源、限制 XML 与节点/路径/滤镜复杂度、导入后规范化并重新命名局部引用，以及如何验证兼容 rig。不能把“经过 sanitizer”当作全部协议。[MDN SVG image contexts](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image) 说明图片上下文有额外限制，document 嵌入不共享这些保证；不能把 `<img>` 的限制当 inline SVG 的安全证明。以上是本任务相关设计约束，没有实现校验器。

配色是角色内容，不应随着 light/dark 把 Human 保存的发色重写。编辑器控件、选择边框、attention 标记仍使用 DSH tokens；角色颜料需明确文档化为内容值边界，不在 styles.ts 随意加 hex，也不占用有限品牌 alias。透明背景和极端颜色的可辨性应通过轮廓、背景座位与预览解决，策略待选。

导出必须能复原外形而非只保留新 identity seed。只写 pack 名或 part ID 会遇到卸载、旧版本改稿与部件缺失；备选是保持旧 pack 可用、打包可验证资产、或静态 fallback 保外形但标记暂不可编辑。recipe、资产版本和 fallback 的 included/omitted 行为必须明确。

**最新公开分享口径**以 [#17](https://github.com/BotHarness/BotHarness/issues/17) 的 confirmed contract 为准：分享 descriptor 与 avatar assets 预先提交到普通 Memory Git；分享头像默认开启并保留 generated appearance；导入创建新身份；未分享头像则新身份取正常默认；git pull 不自动覆盖本地 presentation preferences。这是 OPEN 的交付目标，不是现成导出实现。旧 ADR-0019/0020 的部分 Snapshot 规则在 #17 明确需重新协调，不能照抄历史段落。Avatar 编辑不因此自动改写 Memory：本地保存与 Human/Bot 主动准备 committed sharing metadata 是不同操作。

[#76](https://github.com/BotHarness/BotHarness/issues/76) 只负责身份保持的 Profile Backup/Restore/Transfer，OPEN；与 clone 分享分开。ADR-0086 的图片字节自包含也不证明新的 preset pack 引用自动 dependency-closed。本轮只读检查 core 未找到 SoulSnapshot/export 管线，不能宣称已有可验证 round trip。

## 动画与性能：要验证的约束

CSS transforms/opacity、Web Animations API 或集中采样器都值得比较；没有选库。浏览器动画可返回可暂停/取消的 Animation，见 [MDN Element.animate](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate)。平滑插值应从当前显示姿态续接；活动切换不会重挂整个 SVG，也不会每帧 React state 更新和完整 innerHTML 重建。是否需要集中调度取决于测量，不能因“SVG”就断言便宜。

已有 motion preference 是 `system/full/reduce` 的统一 policy，最终映射 `html[data-botharness-motion]`。新 renderer 应消费它；不引入自己的 preference store。[motion policy](../../packages/client/src/client/motion-preference.ts)。reduce 下保留静态状态与文字/独立标记，装饰循环停止；系统偏好实时变化、页面 hidden、不可见头像、模式退出和卸载都需要明确 cleanup。

现有 client bundle 只允许 shell baseline externals，其他依赖内联；新库应评估增加的 gzip/解析成本并遵循 [bundle contract test](../../packages/client/test/client-bundle.test.ts)。SVG 节点数量、paths、filters、多个同 Bot 实例、长消息历史与多家族同时显示都需测量。不要将 four-up throwaway 原型或 2D canvas 裁剪可用当正式性能证据。

待定验收预算：典型/最大同时可见数量、低配置目标设备、浏览器范围、内存/帧时间、静态/活动切换成本。最终要测同 Bot 多位置、混合 family、多次快速切换、滚动、hidden 与 reduce，记录真实修订与设备；本轮没有运行 Host、加载模型或做 FPS 测量。

## 之后可评审的窄切片（候选）

完整方案经 Human 确认、另获实施授权后，首个生产 seam 切片候选是：Human 在现有 PersonaBot Profile 入口组合一个首版家族的受控部件并保存 → owning module 持久化 → 现有 bridge 重读 → 同一角色出现在 Roster 与放大预览 → 一个真实 tool-kind 通过共享 Projection 驱动动作 → 重连/重启后外形一致。第二家族必须复用同一语义合同验证异构适配，符合 Human 已确认的多家族首版范围。

“需要你”接入取决于 #123 owner 的安全共享合同；等 Assignment 的动画不通过推断补位。Human 已确认首个切片先覆盖执行与 attention，完成／出错动作随后：届时另行定义结果作用域和权威来源。静态预览能支持美术评审，不能冒充已完成真实状态切片。

访谈结束条件：frontier 空且 Human 确认共享理解；Q20 已满足。本研究不会自动进入实现。内部 research 文档保留证据与推导，规范结果已进入 ADR 和 living architecture；双语 Release Ledger 记录文档目标，没有记作功能交付。
