# json-render / @json-render/chat：BotHarness GenUI 适配调研

检索日期：2026-11-07（Asia/Tokyo）。研究结论，不是已采纳 ADR、实现计划或运行验收。

## 结论

**值得用 json-render 的受控 catalog / JSON spec 做一次 GenUI tracer bullet，但不应把 `@json-render/chat` 当作 BotHarness 的完整 GenUI 或 IM 基座。**

- `@json-render/chat` 是 `JSON spec → Chat SDK CardElement` 的 renderer。它不是通用 Web renderer，不负责 Agent、身份、消息 authority、授权或持久化。[J1–J4]
- json-render 整个项目还提供 React、React Native 等 renderer；它们与 Chat renderer 不是同一个依赖，也不是任意 catalog 无损互换的保证。[J1, J5, J6]
- 首个产品行为建议限定为：Bot 在已有 Channel 中输出一个只读结构化报告（指标、有限行数的 Table、一个 Chart、打开既有详情的链接），刷新后仍可读。先不生成审批、支付、任意工具按钮或表单。
- 优先考察 `@json-render/core` + 我们自己的受控显示 adapter；Web 是否采用现成 React renderer，需要先解决 React peer 版本问题。不能为 renderer 偷渡一次全局 React 升级。
- DSH 生态另见 [DSH GenUI 生态调研](2026-11-07-dsh-genui-ecosystem.md)。两者比较应区分 **DSH 接入 seam**、**受控 schema renderer**、**任意 HTML artifact**、**完整 IM transport**，它们不在同一层。

## 证据范围与可复现身份

| 对象        | 本次核对身份                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| json-render | `vercel-labs/json-render`，main SHA `18194121c8f087afacd9a8ef65fbda18374ee039`，commit 时间 `2026-11-04T21:24:52Z`                                                  |
| Chat SDK    | `vercel/chat`，main SHA `b81a4d982674177b6aec91558651df0eba66d435`，commit 时间 `2026-11-06T23:37:01Z`                                                              |
| npm         | `npm view @json-render/chat version time.modified peerDependencies --json` 返回 `0.22.0`，修改时间 `2026-11-04T21:49:41.876Z`；peer 为 `chat ^4.43.0`、`zod ^4.0.0` |
| BotHarness  | 当前 branch `codex/3214-3248-performance`，HEAD `1532839bc9042f2e749de321dd4bfa3b67cb3eb0`；存在其他任务大量未提交改动，未清理或覆盖                                |
| 方法        | GitHub API 读取官方 repository、源码、文档及测试源码；npm 元数据查询；本地源码检查。web 搜索接口未返回可用正文，最终依据为直接读取的 first-party 来源               |

没有安装依赖，没有运行上游测试，没有生成真实模型回复，没有启动 Host / 浏览器 / 原生设备，没有真实 Slack / Teams / Lark 发送或流式压力测试。下文性能与安全要求为建议，不是实测结果。

## 1. @json-render/chat 实际解决什么

### Catalog 与 renderer

模型在约定 catalog 中生成 `{ root, elements }`，Chat schema 要求 root 为 `Card`。内建类型为 `Card`、`Section`、`Text`、`Fields` / `Field`、`Table`、`Chart`、`Divider`、`Image`、`Actions`、`Button`、`LinkButton`。`Fields` 是展示型键值，不是输入字段；此 catalog 没有 TextInput / Select。[J2, J3]

`toCard(spec)` 验证 props 和结构并产出 Chat SDK CardElement。`toPartialCard(spec)` 对不完整输出做 best-effort 渲染。两者不发送消息；`streamCard(target, textStream)` 才直接调用 `target.post(card)` / 返回消息的 `edit(card)`。[J3, J4]

传入 `components` 可以改变验证 definitions，**不等于获得任意自定义 renderer registry**：`toChild` 当前按固定类型 switch 映射，未知 nested 类型抛出 `CardSpecError`。需要我们自己的领域组件时，不能只添加一个 definition 就认为 Chat SDK 会显示。[J3]

### Streaming 的准确含义

`streamCard` 逐 chunk 编译 spec，在存在可见内容后首次 post，之后按时间间隔 edit，最后严格 `toCard` 校验。默认最小更新间隔 500 ms；相同序列化卡片跳过发送。[J4]

这不是逐 token 原生 UI 更新保证，更不是全平台一致刷新频率。最终验证失败时，部分卡片可能已经显示；源码注释也明确调用方要负责错误收尾。当前 helper 中没有显式 AbortSignal 参数、消息持久化、unknown-outcome 协调或我们的最终授权 fence。**这不代表 Chat SDK 本体完全没有这些能力，而是不能把 helper 当作 BotHarness 所需交付语义。**[J4]

`limits` 传给最终 `toCard`；partial 路径只接受 definitions 和 expansion budget，不能把最终校验误称为每次远端 edit 前的完整平台校验。[J3, J4]

### 数据绑定并非远端表单状态

`$state`、`$item`、`$index`、`$template`、`repeat`、`visible` 在构建卡片时解析；Chat catalog 明确不提供输入绑定。默认 expansion 上限为 1000 个 elements / table rows，可配置；这只是渲染 expansion budget，不等于模型输出字节数、深度、流时长或远端平台预算的完整保护。[J2–J4]

### 不要求换模型或 AI SDK

`streamCard` 的实际输入是 `AsyncIterable<string>`；README 的 AI SDK `streamText` 是示例，而不是类型上的硬依赖。可由 DSH 输出 adapter 提供流，但如何从 DSH 获得受控结构化输出仍需按其真实 extension seam 实现。[J4]

## 2. “One catalog for every platform”的实质

**共用意图和形状，不承诺相同交互或相同视觉结果。** Chat SDK 官方文档和 adapter 源码揭示如下差异：[C1–C4]

| 能力              | Slack                                   | Teams                                          | Discord               | BotHarness 关切                                                                 |
| ----------------- | --------------------------------------- | ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------- |
| 普通卡片 / Button | Block Kit                               | Adaptive Cards                                 | 平台对应 card payload | 显示按钮不代表获得 Host 授权                                                    |
| Table             | 支持原生表格；超过限制降级              | Adaptive Card Table                            | GFM 文本表格          | 不能把“支持 Table”写成三端同效果                                                |
| Chart             | 原生 data visualization；超限转文本数据 | Chart 数据转文本                               | Chart 数据转文本      | Teams “原生卡片”不等于“原生图表”                                                |
| 输入字段          | 此 json-render Chat catalog 不提供      | Chat SDK 本体有 TextInput，但此 catalog 不提供 | 此 catalog 不提供     | 不能把 SDK 能力直接算作 renderer 能力                                           |
| Lark / 飞书       | 不适用                                  | 不适用                                         | 不适用                | 本次官方 adapter 目录未发现 Lark / Feishu，需要自建 adapter 或继续现有 Provider |
| 微信 / QQ         | 不适用                                  | 不适用                                         | 不适用                | 未发现相应官方 adapter；WhatsApp 不是微信                                       |

Slack adapter 当前最多使用一张原生 table、两张原生 chart；具体字符、行列、数据点约束仍需按 pinned adapter 与平台实测。其他平台 fallback 可能丢失交互，因此必须有文本替代表达，并让 catalog 知道目标端实际能力。[C1, C2]

## 3. 与我们技术栈的具体匹配

| 项目       | 事实                                                                                                                           | 判断                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Web React  | 本地 `packages/client/package.json` 使用 React `^18.2.0`；`@json-render/react@0.22.0` peer 为 `^19.2.3`，源码与 npm 元数据相符 | **不能称为即插即用**。先评估 core + 本地 adapter；React 升级独立决策               |
| Mobile     | 本地 Expo workspace 使用 React 19.3 / RN 0.88.1；上游 RN peer 为 React 18 或 19、RN >=0.71                                     | 声明范围匹配，不代表 Expo、Fabric、主题、无障碍、平台 native UI 已验证             |
| Zod        | core 本地依赖 Zod 4.4.3；上游 core / chat 要求 Zod 4                                                                           | 声明范围匹配；仍需检查 bundle / 重复依赖                                           |
| IM         | 现有 MessagingProvider 有 `consume` / `onAction`、受限审批卡、`beforeSend`，普通发送以 text 为主                               | Chat SDK 不能直接取代它；必须保留现有 Binding / Grant / Outbox / Receipt authority |
| 浏览器使用 | Chat renderer 的 elements builders 用 Chat SDK 类型，不直接运行其 Node entry                                                   | 不能据此声称必须引入整个 Chat SDK runtime 到 Client；但实际依赖体积尚未测量        |
| 协议复用   | React / RN / Chat 可以共享高层语义和部分 spec 结构，但 schema、类型、action 与输入能力不同                                     | 先选有限共同子集；不要承诺“一份任意 JSON 所有端完全一致”                           |

上游代码与本地包声明见 [J5–J7] 和本地 `packages/client/package.json`、`apps/mobile/package.json`、`packages/core/package.json`。本地文件属于读取时 working-tree 事实，不冒充干净发布包。

## 4. 推荐的架构方向（待选，不定义新 interface）

### A. 深化现有 Channel presentation module，再接报告

**Strong（现有语义 locality）；GenUI payload 提取为 Worth exploring。** `ChannelMessage` 已携带审批、Question、private-input 等结构化记录；Web 的 `channel-message-body.tsx` 和 Native 的 `host/conversation.ts` 分别解释它们。两个真实显示消费者已经存在，但不是已实现两个 GenUI adapter。先集中共享的语义分类、版本与当前状态解释，不统一平台显示控件。现有 Channel 事实继续由既有 module 拥有；结构化报告只增加受控展示数据，不另建 GenUI transcript store。第一条可运行 GenUI 路径选 Web，第二个 GenUI adapter 选真正要用的 Native 或 Lark，而不是为了证明通用性先接 Slack / Teams。

- locality：校验、限额、版本兼容、fallback 集中，避免每个 timeline / IM adapter 重复实现。
- leverage：一个已验证报告可被两个真实 adapter 消费。
- deletion test：若删除这个 module，只是少了一个透传 `toCard` 的函数，它就是 shallow，不值得保留；只有删除会把校验、回放和 fallback 重新散落到多个 caller 时，depth 才成立。
- interface 是 test surface：无模型的同一份报告 fixture，必须能经实际显示 seam 测试；不只测 JSON parser。
- 时机：第二个 adapter 有真实需求时再提取共享 seam；目前不建立“全平台 UI 编排框架”。

源码定位：`packages/core/src/channels/channel.ts:290`、`packages/core/src/channels/sqlite-store.ts:647`、`packages/client/src/client/channel-message-body.tsx:462`、`apps/mobile/src/host/conversation.ts:302`、`apps/mobile/src/ui/chat/conversation-screen.tsx:265`。沿用 ADR-0037 的事实 / placement 分离。

### B. 将生成内容与真实操作能力分开

**Strong 约束；不是当前必须重构的证据。** 模型能选 catalog 中的显示类型，不得据此生成 authority。已有审批 / pairing / Question 继续走现有 owner；GenUI 不产生另一套 approval state machine。未来需要交互时，adapter 只能呈现由 Host 批准、绑定真实当前身份和请求状态的操作。[本地 MessagingProvider；ADR-0117、0136、0139]

回调必须重新检查当前 Bot / Binding / Grant / Channel、真实用户身份、请求 revision / expiry 与去重。不要相信模型写出的 Button id、value、回调 URL 或“Approve”文字。SDK 的展示能力不是权限证明。

### C. 暂不抽象完整 Chat SDK transport

**Speculative，不推荐现在做。** 已有 dsh-im / MessagingProvider seam。为一个 renderer 再引入完整 webhook、会话状态、订阅和发送生命周期，会使同一消息穿越两套 authority，降低 locality。未来真实 Slack / Teams 需求出现，可评估 Chat SDK 作为现有 seam 后的一个 adapter，而不是取代 Channel / Outbox。

### D. 富内容发布深化显式 send，不接管诊断 trace

**Worth exploring。** `bot_send_message` 现有路径负责明确目标与发送；`tool-trace.ts` 刻意 flatten / clip 工具结果并做 secret redaction。ADR-0250 明确普通 assistant output 保持私有，不自动提取为 Channel 消息。因此报告应由 Bot **显式发布**，不能将每个 tool result 或最终 assistant 文本自动投进公共 Channel。显式 send 的 authorization、deduplication、receipt / cleanup 带来 depth；仅透传 JSON 的 wrapper 没有这种 leverage。

源码定位：`packages/core/src/runtime/bot-message-tool.ts:129`、`packages/core/src/runtime/bot-message-tool.ts:268`、`packages/core/src/bots/tool-trace.ts:59`、`packages/core/src/bots/tool-trace.ts:148`；相关决策为 ADR-0250、0039、0141。

## 5. 首个 tracer bullet 与验收门槛

**用户行为：** Bot 在现有 Channel 回答一个报告问题，显示有限指标、一个 Table、一个 Chart 与打开已有详情的 Link；刷新后仍能读取同一结果。内容来源、Bot 和 Channel 归属保持原 authority。

1. 先选择确切 DSH extension seam 与报告归属；不创建第二份消息事实，不直接从 tool 绕过 Outbox 远端发送。
2. 最小 catalog + 严格验证；设定输出字节、树深度、元素数、行数、字符串、图片 URL scheme / host 和协议版本限制。无效内容显示明确 fallback，保留可诊断拒绝码。
3. 单端生产形态路径先贯通：模型生成 → 显式发布 → owner module → 已有持久化 → Client adapter → 刷新回放。初版不需要外部 IM 和 streaming 同时上线；不把私有 assistant / trace 自动公开。
4. 使用相同 fixture 从 CLI / 直接工具路径验证，不依赖模型才能重现；若新增 Host bridge / route / tool，同一变更必须补 CLI parity。
5. 再加入 bounded streaming：partial 内容不得暴露尚未确定的危险操作；取消 / 超限 / 断流需收尾；第三方发送必须保留 unknown outcome，不盲重试。
6. 与 Human 评审第一条真实路径，再决定 Native 或 Lark 作为第二 adapter，以及是否扩展输入和按钮。

### 性能评估与 guard（计划，不是实测）

- 文档调研本身无产品 runtime impact；本次不增加依赖。
- 候选依赖要测实际 Client bundle delta、Host 峰值内存 / CPU、spec 校验和回放耗时；`streamCard` 每次 flush 会构建并序列化卡片，不把 500 ms interval 直接当作性能达标证据。
- 用户旅程分别测首次可见、最终完成、刷新回放、长历史打开、前台滚动；基础聊天与新增报告成本分开报告。
- 相同 source / runtime / fixture，before / after 至少 3 组交错运行；依赖选择至少 5 组，记录失败、median、range 和正确性。没有数据前不声称更快、更省 token 或低端手机流畅。
- 使用 malformed spec、过深 / 过长 / repeat expansion、截断流、取消、旧版本回放、失效权限、重复回调、未知发送结果作为 guard；新输入类型须纳入 CI plan。
- timeline 结构预算不放宽；真实 headed browser 滚动与 Native / Human acceptance 分开。纯 parser microbenchmark 不能替代端到端验收。

## 6. 一手来源

下面均在 2026-11-07 直接读取；源码用固定 SHA，文档描述与实现差异以对应实现为依据。测试只阅读，未执行。

- J1：[json-render README / license](https://github.com/vercel-labs/json-render/tree/18194121c8f087afacd9a8ef65fbda18374ee039)。Apache-2.0；仍需做实际引入依赖的 license 检查。
- J2：[Chat README](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/chat/README.md)、[catalog](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/chat/src/catalog.ts)、[schema](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/chat/src/schema.ts)。
- J3：[Chat render implementation](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/chat/src/render.ts)、[render tests](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/chat/src/render.test.ts)。
- J4：[streamCard implementation](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/chat/src/stream.ts)、[elements builders](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/chat/src/elements.ts)。
- J5：[React package](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/react/package.json)、[React renderer](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/react/src/renderer.tsx)。
- J6：[React Native README](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/react-native/README.md)、[package](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/react-native/package.json)。
- J7：[Chat package](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/chat/package.json)、[core package](https://github.com/vercel-labs/json-render/blob/18194121c8f087afacd9a8ef65fbda18374ee039/packages/core/package.json)、[npm package metadata](https://registry.npmjs.org/@json-render%2fchat)。
- C1：[Chat SDK Cards 文档](https://github.com/vercel/chat/blob/b81a4d982674177b6aec91558651df0eba66d435/apps/docs/content/docs/cards.mdx)。
- C2：[Slack cards implementation](https://github.com/vercel/chat/blob/b81a4d982674177b6aec91558651df0eba66d435/packages/adapter-slack/src/cards.ts)。
- C3：[Teams cards implementation](https://github.com/vercel/chat/blob/b81a4d982674177b6aec91558651df0eba66d435/packages/adapter-teams/src/cards.ts)。
- C4：[Discord cards implementation](https://github.com/vercel/chat/blob/b81a4d982674177b6aec91558651df0eba66d435/packages/adapter-discord/src/cards.ts)、[official packages directory](https://github.com/vercel/chat/tree/b81a4d982674177b6aec91558651df0eba66d435/packages)。未发现某平台只表示本次官方目录范围，不宣称不存在第三方 adapter。

## 7. 与 DSH 生态的最终横向比较

完整源码身份、逐项实现与 61 个固定版本链接见 [DSH 生态报告](2026-11-07-dsh-genui-ecosystem.md)。以下为两份调研的综合判断，不是新增运行证据。

| 候选                                               | 生成和 streaming                                                                      | 状态 / 操作                                                                              | 对 BotHarness 的判断                                                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| DSH-native presentation / Slots                    | trusted Plugin 提供 Tool presentation、Conversation Node、Slots；不是任意生成 UI 协议 | SessionEvent / Persistence 与 Host 操作分别拥有执行事实与 mutation；Slots 不提供 sandbox | **接入 seam，不是 renderer 竞争品。** 与 json-render 可组合；也不能把 DSH 原生 Session UI 自动等同 Channel UI                 |
| json-render core + 各端 renderer                   | catalog 限定 JSON spec；Chat 流为 partial card + post/edit                            | display spec、平台 Button；产品状态与授权需自行接入；Chat catalog 无输入                 | **跨端受控报告的优先实验候选**，不是直接全面采纳；现成 Web React peer 不匹配，Native / IM 仍要实际 adapter                    |
| omdsh-dev `@changfenhuang/dsh-genui@0.16.0`        | `dsh-ui` JSON / `render_ui`；恢复已完成的 partial component                           | spec 可由 Session metadata 回放；交互值主要在 localStorage；显式动作送回 Session         | **最值得借鉴的小型 DSH 声明式表单 / 图表实现**；移植 renderer 思路，不能照搬 DOM 扫描、Session 身份与本地状态归属             |
| Valuz `@valuz/dsh-valuz-genui@0.2.2`               | A2UI messages；tool delta 临时视图 → settled result metadata                          | action 送回 Session；UI draft 不因此持久化                                               | **优先借鉴 provisional / settled 分离**；A2UI 是另一协议选择，不因名字而免除原生 / IM adapter 工作                            |
| pengyue-polaron `dsh-plugin-genui@0.15.2`（#2114） | 编译 React artifact；pending title streaming，不等于逐段 TSX 运行                     | Host 磁盘版本、state、grant；CSP + MessageChannel capability bridge                      | **若目标是独立 task app，值得另开验证。** 比报告 renderer 重；兼容范围明确包含本地 DSH rc.2–rc.3，不保证当前 0.2.2 prerelease |
| MindLab `dsh-generative-ui@0.2.0`                  | 真正增量编译 TSX，运行 blob module                                                    | `$dsh/*` 能力；state 使用 localStorage；执行位于 Web Client document                     | **不作为不可信模型 UI 默认方案。** 灵活性强，但 compiler 不等于 sandbox；成本和权限模型需独立审查                             |
| lhuans `dsh-genui@0.3.1`                           | OpenTiny / Vue schemaJson；处理 incomplete schema                                     | Vue light DOM，callback 回填并提交当前输入；替换 assistant-step renderer                 | 组件库存有吸引力，但 React / Vue / theme 与整体 renderer 替换的兼容面更大，不作首选                                           |
| yunyv `dsh-intelligent-ui@0.1.1`                   | DIL 受限程序 + 独立 HTML escape hatch                                                 | DIL opaque iframe + Worker；版本 store；HTML 使用另一个 CSP policy                       | 需要隔离本地计算时再深入；不能把 DIL 的限制自动套给 HTML 路径                                                                 |

其他 Jessen HTML card、AlbertZJ stateful variant、较早的 yogaaaa123 renderer 均列在专项报告。**不存在一个经本次验证、直接覆盖 BotHarness Web + Expo Native + Lark / Discord 的完整现成方案。** 这是本次九个 repository 的检查范围结论，不声称世界上不存在其他 adapter。

### 决策建议：不是 json-render 与 DSH 二选一

- **DSH 提供接入 seam**；**受控 renderer 提供表现力**；**BotHarness 拥有 Channel 内容、发布、操作授权与回放**。三者可组合，职责不可互相代替。
- 第一轮只比较能表达同一个只读报告 fixture 的小候选：json-render core / 本地显示 adapter 与 omdsh 风格受控 renderer。若互操作 A2UI 是真实需求，再把 Valuz 路径纳入；不先引入多个协议。
- 如果 Human 的 GenUI 目标其实是可编辑、版本化的小应用，则转向 pengyue 的 artifact 方向重新界定范围，而不是把它挤进“聊天卡片”采纳结论。
- 报告 / 表单 / task app 的优先级必须由产品行为决定。当前源码调查没有找到足够依据，授权一次全量架构重构或替换现有 IM transport。

### 最终优先级

1. **Strong：** 深化现有 Channel presentation 的共享语义与当前状态解释，只覆盖首个报告行为需要的部分。
2. **Worth exploring：** 在既有显式发送 module 上增加受控富内容，保持 private trace 与公开消息分离。
3. **Worth exploring：** 真实 IM 需求出现后深化现有 Outbox / Provider 的能力与 fallback；统一外部 card transport 暂为 **Speculative**。

建议第一条 tracer bullet 仍为**只读报告**，而不是先做输入表单。专项报告中的 selection form 是另一个可选行为，不是本次同时批准扩展的范围。先取得 Human 对真实报告体验的反馈，再扩展输入、模型可读提交与危险操作。

## 8. T3 Code 补充：借鉴交付体验，不混淆执行策略

Human 在设计访谈中追加了 T3 Code 调研，完整证据见 [T3 Code 专项报告](2026-11-07-t3-code-genui.md)。固定公开源码为 `pingdotgg/t3code@6d450a4284852af137b2f3407fddd89eb76e7644`；该归属与本地安装元数据有对应线索，但当前活跃 Client / Server 的准确版本没有完成运行核验。

- **普通 HTML visual reply：** 模型生成完整 HTML，preview 提供截图 / console / 高度诊断，publish 保存 thread-owned attachment，再由 Web iframe / mobile WebView 显示。它不是 json-render 式的受控 catalog 协议，也不是连续 spec patch stream。
- **MCP Apps：** 文档另行描述 MCP server 提供的应用与工具 / 消息 / context bridge。不能将这条路径的 callbacks 自动归给普通 `html_render`。
- **持久化：** 保存 HTML 与 thread reference 不等于保存筛选、表单或其他交互状态；局部点击不等于 Bot 收到了新的指令。
- **安全：** inspected iframe 使用 opaque-origin sandbox，但没有据此证明 published HTML 禁止联网。preview 的公共地址 proxy 和发布后的文档不是同一网络策略。
- **跨端：** T3 的 Native App 使用 WebView 承载 HTML；这提供一种交付模式参考，不证明 BotHarness 必须采用或拒绝 WebView。我们已确认的是 mobile / desktop 产品体验和受控声明式生成，不是所有显示必须由原生控件实现。

**对当前建议的影响：** 保持 JSON / trusted renderer 默认策略，借鉴 generation / preview / publication 分离、文档身份、主题、高度与 overflow contract。把“普通显示事件”和“显式请求 Bot / Host 操作”作为不同语义。至于每次交互是否唤醒 Bot、快照 versus live、catalog 自由度及具体显示技术，继续由访谈决策，而不是由 T3 的实现替 Human 决定。

该补充不选择新依赖，不修改此前的采纳等级，也不将任何未执行的浏览器、Native、安全或性能 gate 标为通过。

## 未决问题

- 我们首要 GenUI 是受控报告卡片、原生表单，还是任意 HTML 应用？三种目标不应混成一个采纳结论。
- 第二个真实 adapter 优先 Native 还是 Lark？这决定 catalog 的共同子集与 fallback，而不是上游 Slack demo 决定。
- 真实 DeepSeek 输出遵循率、修复次数、token 成本和长输出 streaming 负载尚未验证。
- 完整採纳需要锁版本、依赖审计、性能 baseline，以及 DSH / 本地 renderer seam 的运行证明；本次研究不替代这些 gate。
