# dsh-im × BotHarness 外部 IM 接入策略

## 2026-10-01 工作群核验补充

[#78 的当前 provider 能力矩阵与真实工作群证据](2026-09-20-feishu-message-edit-recall-events.md#2026-10-01-work-group-contract-qualification-78) 更新了下方入站判断：最小 fork 的公开独占 consumer 和受校验回复已在 Lark 普通群与已有话题实测，但尚未发布或获上游接受，也尚未接入 PersonaBot Inbox/Orchestrator。沿用 dsh-im 的单连接 owner，再由 BotHarness Bridge 接入 Messaging 权威；不另开 SDK 监听器。后续 #12 以工作群 @Bot 为首条路径。下方 9 月快照中“入站缺公开 seam”的判断只适用于其注明的上游版本。

| 项目        | 当前核验结果                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 核验日期    | 2026-09-30；本次更新 supersedes 下方 2026-09-21 快照中的版本与契约判断                                                                                                               |
| dsh-im 源码 | [`6d97c9c09823050c293eef0e740f24dda1499ba3`](https://github.com/xmanrui/dsh-im/tree/6d97c9c09823050c293eef0e740f24dda1499ba3)，提交时间 `2026-09-29T03:08:57Z`                       |
| 发布版本    | [`v4.32.0`](https://github.com/xmanrui/dsh-im/releases/tag/v4.32.0)，发布时间 `2026-09-29T03:13:28Z`；tag 指向上述 SHA；npm 已有 `@xmanrui/dsh-im@4.32.0`，registry 未提供 `gitHead` |
| 本仓库 DSH  | `@deepseek-ai/dsh@0.2.0-rc.1`；以下 compatibility 是静态核验，静态研究之后的隔离 Host/Client 实测见下方补充，尚非完整 #117 验收                                                      |
| 任务        | [#78](https://github.com/BotHarness/BotHarness/issues/78)，为 [#117](https://github.com/BotHarness/BotHarness/issues/117) 首个 Feishu/Lark 主动纯文本切片核实最小契约                |

## 2026-09-30 当前契约与边界

**现有公开 Service 可执行只出站切片；双向入站仍缺独占 consumer seam。** 保存的 target alias 可以原位改址，因此 `botId + targetId` 并不是 immutable destination。不能把页面上的连接/测试成功、平台 SDK 成功或本地 CLI 登录推断为 BotHarness 已验证的身份、目标或交付事实。

静态研究读取公开源代码、官方 SDK/CLI 和发布元数据；后续同一实施任务完成安装、应用绑定与 Host/Client smoke，证据单独记录在下方实测补充。静态研究阶段未发送外部测试消息；后续真实 Profile 的 Binding/Grant/Outbox 与 Human 收件确认见下方实测补充。

### 公开 Host Service

以下是 **application-defined dsh-im Service**，通过 Cordis `ctx.provide('dshIm', ...)` 提供，不是 DSH-native Messaging API。当前 facade 暴露恰好三个方法；Host Service 没有自己的 `version` 或 capability negotiation 字段：[Host facade](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/index.mjs#L90-L99)。

```ts
interface DshImHost {
  send(
    botId: string,
    targetId: string,
    text: string,
    options?: { signal?: AbortSignal; format?: 'plain' | 'markdown' },
  ): Promise<{ sent: true }>;
  listBots(): Promise<Array<{ botId: string; channel: string }>>;
  listTargets(botId: string): Promise<
    Array<{
      targetId: string;
      name?: string;
      kind: string;
      route: Record<string, unknown>;
      sessionSync?: { enabled: boolean; state: string };
    }>
  >;
}
```

`send` 上面的 string 参数是公开主动投递文档承诺的调用形状；源码另外接受 draft，见下文。`listTargets` 的 facade 只返回 targets 数组，内部 DeliveryService 的 `{botId, channel, targets}` 包装不会透出。`listBots` 只说明当前 adapter 拥有这些 opaque Bot IDs，不证明账号已连接。targets 是持久配置，离线仍可以列出。Feishu 使用 `kind: 'user', route: {openId}` 或 `kind: 'group', route: {chatId}`。这些 route 不是 secret，但属于 Host 投递边界，BotHarness 不应将其暴露成模型自由输入或 Client 决策权：[DeliveryService](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/delivery-service.mjs)，[adapter](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/delivery-adapter.mjs)。

| 所需事实                                                | 当前公开 dshIm Host Service                                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| opaque Bot ID 与 channel                                | 支持；Feishu 新 ID 使用随机 UUID；删除重建不能按显示名自动重绑                                |
| saved target ID、名称、kind、route                      | 支持；同一 target ID 的 kind/route 可以修改                                                   |
| authenticated account fingerprint / config generation   | **未提供**；内部 `configuredBotFingerprint` 是 repair 防漂移机制，未导出到 Service            |
| account health / connected                              | **未提供**；Feishu management RPC 有健康投影，但不能将其当成 Host Service 的承诺              |
| target 最近测试通过及其 route digest                    | **未提供**；target Test 只返回 `{sent:true}`，成功提示是 Client `testState`，没有持久测试凭据 |
| provider message ID / idempotency / outcome lookup      | **未提供**；平台结果被归约为 `{sent:true}`                                                    |
| authenticated inbound subscription / exclusive consumer | **未提供**；仍直接驱动自己的 DSH Session                                                      |

来源：[Feishu opaque ID 与内部 fingerprint](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/src/channels/feishu/multi-bot-controller.mjs#L81-L107)，[公开 health 投影](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/channels/feishu/rpc.mjs#L240-L246)，[target test RPC](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/delivery-rpc.mjs)，[Client test state](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/client/delivery-settings.js#L304-L316)。

### 目标冻结：源码事实与公开契约必须分开

正常文档调用 `send(botId, targetId, text)` 会在执行时再次查找 alias；`listTargets → digest 比对 → send(alias)` 之间没有原子 compare-and-send。Human 在 dsh-im 面板同时改址时，可能通过比对后仍发送到不同目标。仅加 route digest 检查不足以声称消除了此竞态：[saved alias lookup](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/delivery-service.mjs#L291-L328)，[目标编辑的文档承诺](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/PROACTIVE_DELIVERY.en.md)。

**已验证源码行为，尚非文档承诺的 Host 契约：** 公共 facade 原样转发第二个参数；DeliveryService 接受 exact `{kind, route}` draft，不读取或保存 targets，将其送进已有 adapter。draft 禁止 `targetId`、`name` 等额外字段。上游自动测试明确覆盖“without reading or persisting targets”，但正常 Host 主动投递文档仍要求 saved alias；文档明确支持 draft 的入口是 management `target.test`。不能静默把它作为稳定 API：[public facade](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/index.mjs#L90-L99)，[draft branch](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/delivery-service.mjs#L291-L328)，[draft contract test](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/test/delivery-service.test.mjs#L126-L178)。

可评估的有界选项是：固定 `4.32.0`，Host 在每次执行时重读 saved target、比对 Binding 中已认可的 route digest，将该次冻结的 `{kind,route}` 仅保留在 Host 临时内存并经公开 facade 发送。无 private import、无 native route 持久副本、无 Client route 暴露。采用前必须以 ADR 明确该未文档化契约、失败关闭/升级门禁、退出条件，并验证 public facade contract 与真实 Host smoke；否则需上游增加版本化目标/条件发送。route digest 只证明目标内容，仍不能替代缺失的 authenticated account fingerprint。这一选项是待决策候选，**本研究未将其标为已接受**。

### 发送结果、错误、取消与 Registration 生命周期

- `{sent:true}` 仅表示平台 API/SDK 成功，不能记为 delivered/read。Feishu `message.create` 返回的 `message_id` 没有保留；当前调用不传 `uuid`。dsh-im 不写主动发送历史，也不自动重试：[proactive semantics](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/PROACTIVE_DELIVERY.en.md)，[Feishu send](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/src/channels/feishu/feishu-runtime.mjs#L677-L721)。
- 公共错误码有 `bad-request`、`unknown-bot`、`unknown-target`、`target-conflict`、`invalid-target`、`bot-not-connected`、`target-rejected`、`delivery-failed`、`session-sync-unavailable`、`cancelled`。未知异常被归约为 `delivery-failed`，不能从该码推导平台肯定没收消息。Feishu 把所有非零 API 响应 code 都归入 `target-rejected`，也不能将名称解释为只有目标错误：[error mapping](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/delivery-service.mjs)。
- Feishu 只在 SDK 调用前 `signal.throwIfAborted()`，未把 signal 传给 `message.create`，也无发送后的 cancellation 检查。开始调用后的超时、取消、停用、Host 崩溃可能已产生外部消息；BotHarness 必须保留 unknown outcome，禁止盲重试。预执行取消才可断言没有执行该调用：[Feishu send](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/src/channels/feishu/feishu-runtime.mjs#L700-L721)。
- adapter Registration 由 channel 名称覆盖，旧 dispose 不删除新 Registration。生产 channel 在 Fiber effect 清理时先撤销 adapter、再关闭连接；失败初始化也清理。撤销影响后续 lookup，不证明已取得 adapter 的 in-flight SDK 调用没有外部效果。BotHarness 的 Provider Registration 也必须由消费 Plugin/Fiber 撤销，持久 Binding/Outbox 不能保存 live Service reference：[registration](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/delivery-service.mjs#L127-L135)，[production cleanup](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/channels/shared/startup.mjs#L45-L63)。

### Client 与 DSH 0.2.0-rc.1 compatibility gate

`dshImClient` 的 `version:1`、`render({preferredSectionId:'feishu'})`、`setSettingsVisible`、`settingsVisible` 仍受 [官方 Client contract](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/docs/client-integration.md) 约束。它是管理面板入口，不是 PersonaBot Binding authority。只在替代入口真正可访问后隐藏原入口；consumer dispose 恢复原入口。复用 Host React，不打包第二份 React。

`4.32.0` [package manifest](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/package.json) 只声明 DSH `0.1.7-alpha.1` compatible，不能推导 `0.2.0-rc.1` 已支持或已不兼容。静态源码已包含 modern Typert 路径：检测 `typertGateway.stream` 后 inject `sessionController`/`workspaceController`，legacy 路径 inject `apiProxy`；management 通过 `connection.fetch.register` 注册 exact `/api/dsh-im...`，没有第二个 `/api` interceptor；Client inject `slots/connection/locale/workspaces`，目录 API 可选消费 `uiWorkspace`，Client bundle 仍用 `window.__ModuleLoader__`。这些是实际 smoke 需要逐一验证的 seam：[Host activation](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/host/index.mjs#L104-L114)，[management carrier](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/management-rpc.mjs)，[Client injection](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/client/index.js#L89-L100)，[Client packaging](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/plugin-src/client/build.mjs)。

最小 smoke：在任务独占 DSH_HOME、worktree 与端口中 pin 安装 `@xmanrui/dsh-im@4.32.0`，用本仓库 `scripts/dev-instance.mjs` 验证实际 CLI 为 `0.2.0-rc.1`；验证 authenticated native `/api` 与 BotHarness RPC 未被遮蔽，`dshIm` discovery/listBots/listTargets，Client Feishu 面板 mount/unmount，Provider dispose/reload 的 capability 失效；然后用专用组织测试 App 完成真实目标发送并让接收者确认。若采用 draft，额外验证 public facade 精确 draft、alias 改址竞态和取消后 unknown。无凭据时只完成空配置 Host/UI smoke，不能标记真实投递通过。

### 2026-09-30 隔离 Profile 实测补充

同一实施任务随后在任务独占的 DSH_HOME、端口与最新 main 工作树中安装 npm `@xmanrui/dsh-im@4.32.0`，实际运行 pinned DSH `0.2.0-rc.1`：

- Bundle 安装成功，Host 启动；authenticated native `settings/describe` 与 `botharness/list` 均 HTTP 200／`ok:true`。dsh-im 的 exact Fetch endpoint 没有遮蔽 native `/api`。
- 真实浏览器中的「IM机器人」设置入口与 Feishu 面板成功挂载，没有 pageerror；这是 Client smoke，不是 BotHarness Binding UI。
- Human 通过 lark-cli 创建专用测试应用；新应用 bot identity 被 CLI 验证为 ready。其 App Secret 仅在本机经公开 `bot.bind-credentials` 交给 dsh-im，并由 DSH credentials 保存，未写入研究笔记、Git、RPC read model 或执行输出。
- 公开 `connection.status` 返回该 Bot connected／healthy；Host 重启后同一 opaque Bot ID、连接与凭据引用保留。公开 `dshIm` Service 可在账号异步恢复之后查询账号及目标；启动早期的空列表不等于账号不存在，Consumer discovery 必须允许后续刷新。
- 为只出站测试，公开访问策略将 direct/group 都设为空 allowlist；dsh-im standalone inbound 不执行模型。没有启动第二个相同账号 listener。

- Human 已完成专用应用下的最小用户授权，CLI `auth status --verify` 验证 user identity ready、token valid。收件人使用这次验证所得的本人 Open ID，不复用旧 CLI 应用身份。
- 通过公开 `target.create/list` 保存仅本人 DM 测试目标，关闭 Session Sync；冷重启后，公开 `dshIm.listBots/listTargets` 读到同一账号和目标，目标内容摘要与本人身份一致。此验证只覆盖任务独占测试环境中的配置持久性，不证明 saved-target alias 没有运行时改址竞态。
- 冷重启观察到任务临时 Consumer Fiber 的 effect 清理，重启后 Service discovery 恢复；这不证明 provider send 的 in-flight cancellation 或 SDK disposal 安全。

- Human 明确授权一条本人测试消息之后，任务临时 Consumer 通过真实 Host 的公开 `dshIm.send` facade 传入冻结的 `{kind, route}` draft；2026-09-30 14:39:43–14:39:44 UTC 调用一次并返回 `{sent:true}`。已先核对专用 App 连接/健康和本人目标内容摘要；公开 facade draft 的真实平台调用接受已验证。本次仅为隔离研究 probe，不代表生产已采纳该未文档化签名，也不替代 ADR／版本契约门禁。
- 结果只记 `provider-accepted`，没有声称对端 delivered/read。dsh-im 未返回 provider message id；Human 随后明确确认本人已收到，完成这一条测试消息的对端验收。一次性探针在调用前保存 started/unknown 记录，禁止盲重试；结果保存后关闭发送入口并冷重启，留下只读 discovery probe。该临时记录是研究过程证据，不是 BotHarness canonical Outbox。

**仍未验证：** BotHarness Binding／Service Grant／Outbox、saved-target alias 改址竞态、Provider disposal 与 unknown-outcome crash window。

### 入站缺口与 Feishu/Lark 最小官方事实

Feishu runtime 的 `im.message.receive_v1` callback 仍 `void bridge.accept(event)`，直接返回；Bridge 后续使用 `askInWorkspaceSession`。因此既没有独占 external consumer，也不会等待 BotHarness durable ingress commit 才 ack。不要创建第二个相同 app credential listener 作为并行接管方案：[listener](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/src/channels/feishu/feishu-runtime.mjs#L381-L385)，[native Session execution](https://github.com/xmanrui/dsh-im/blob/6d97c9c09823050c293eef0e740f24dda1499ba3/src/channels/feishu/bridge.mjs#L5540-L5553)。

官方 `larksuite/node-sdk` 本次固定 [`394c83092395a51402ee408b751d7f9fb05f5518`](https://github.com/larksuite/node-sdk/tree/394c83092395a51402ee408b751d7f9fb05f5518)，package `1.74.0`；dsh-im build 声明 SDK `1.73.0`，这两份快照不能当成同一已运行版本。[官方 SDK source](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/code-gen/projects/im.ts) 证实 text create 参数为 `receive_id_type`、`receive_id`、序列化 JSON `content`、`msg_type:'text'`，可携带 `uuid` 并返回 `message_id`；reply 使用可信 `message_id`，可携带 `reply_in_thread`、`uuid`。平台有 uuid 字段，不代表 dsh-im 当前公开接口已暴露幂等能力；本次不宣称 uuid 的时窗/跨重启保障。

[官方 receive event types](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/code-gen/events-template.ts#L4421-L4470) 带 sender type/IDs、tenant/app、message ID、chat ID/type、root/parent/thread 与 JSON content。application-defined Ingress 应以注册账号加平台 message ID 做消息去重，保留事件证据，不能用显示名或自由输入 chat ID 构造 trusted reply route。官方 [SDK 长连接说明](https://github.com/larksuite/node-sdk/blob/394c83092395a51402ee408b751d7f9fb05f5518/README.zh.md#L616-L660) 明确连接时鉴权、超时可重推、同应用多客户端随机单播；这支持“一账号一个 listener owner”和快速 durable accept 后处理，不能假设多 listener 广播。具体 replay/cursor、断线补发边界仍需 sandbox 证明。

主动发送/回复的 bot scope 最小官方证据是 `im:message:send_as_bot`：官方 CLI 本次 SHA [`7beffb086d7fa3c5b843d8affa7c089f49cfc65e`](https://github.com/larksuite/cli/tree/7beffb086d7fa3c5b843d8affa7c089f49cfc65e) 的 [send](https://github.com/larksuite/cli/blob/7beffb086d7fa3c5b843d8affa7c089f49cfc65e/shortcuts/im/im_messages_send.go#L17-L25) / [reply](https://github.com/larksuite/cli/blob/7beffb086d7fa3c5b843d8affa7c089f49cfc65e/shortcuts/im/im_messages_reply.go#L15-L23) BotScopes 都如此。入站 DM 需开启机器人能力、订阅 receive event 并在组织 App 后台确认实际授权范围；本次官方文档 SPA 未返回正文，未独立核实其权限目录当前推荐名称，不能照搬旧 broad `im:message` 权限替代现场确认。[平台 create](https://open.feishu.cn/document/server-docs/im-v1/message/create)、[reply](https://open.feishu.cn/document/server-docs/im-v1/message/reply)、[receive](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive) 是最终权限/范围核验入口。

### #117 的完成条件与后续 gate

1. Human 从 dsh-im 管理面板完成专用测试 App、账号与 saved target，BotHarness 用自己的 Binding/Grant UI 绑定一个 PersonaBot；已有 lark-cli bot 登录不等于这个专用 App 或 target 已验证。
2. 接受与执行 Service Action 时都检查 active Bot、Binding、Grant、Provider availability、target digest；先提交 Outbox Intent，再执行，成功只记 provider accepted；未知不得盲重试。
3. `0.2.0-rc.1` Host/Client smoke、专用 App 连接和本人目标冷重启已验证；一次本人 DM 的平台接受已验证，只证明这一个目标/消息当时有权执行，不推广组织权限/可用范围。对端已确认；公开 fingerprint 契约仍待上游扩展接受和实际 Host 验证；生产采用 draft 调用需要 ADR 和 contract gate。
4. #12 双向 DM 必须等 exclusive authenticated consumer、disable-standalone/fail-closed、durable accept ack 与可信 reply operation 落地；#117 完成也不能解除这个 gate。

---

下方保留 2026-09-21 的策略推导与快照来源；其 `4.24.0` / DSH `0.1.5-rc.2` 信息是历史事实，当前实施以本节 `4.32.0` / `0.2.0-rc.1` 核验和未验证项为准。

## 2026-09-21 历史策略与依据

**不是二选一。推荐“Letta 风格控制面 + dsh-im transport/provider 实现”的分层组合。**

- BotHarness 持有 application-defined **Bridge Connection、Binding、Channel、Source Event、Bot Inbox、Reply Route 与 Outbox authority**。
- dsh-im 作为独立 DSH **Plugin/Fiber** 持有平台连接、SDK、重连、平台原生呈现与账号健康；BotHarness 通过稳定 **Service Definition → Provider** 消费能力。
- 当前即可直接消费 dsh-im 的 `dshIm` Host Service 做“已保存目标的主动纯文本发送”，并可选择消费 `dshImClient` 嵌入完整管理面板。
- 当前**不能**把 dsh-im 当成 BotHarness 的完整入站 Provider：dsh-im 的公开 `dshIm` Service 没有 inbound subscription；收到消息后，它会自己按 conversation key 创建/绑定 DSH Session，并直接 `ask()`。这绕过 Source Event → Channel → Inbox Admission → Bot Inbox → Orchestrator。
- 因此 v1.1 的完整双向 Bridge 需要 dsh-im 上游增加一个**独占 consumer / provider mode**，或提供等价稳定 seam：交出 authenticated inbound evidence，且在该账号被 BotHarness 接管时禁用 dsh-im 原生 Session 驱动。不要读取 dsh-im 私有 JSON、import 未导出的内部模块或 fork 整包来伪造 seam。

换句话说：**Letta Connections 是控制面/资源模型参考，dsh-im 是数据面实现；两者职责不同。**

## 已确认事实

### 1. dsh-im 已经是成熟的多渠道 DSH Plugin，而不只是 SDK 包装

Host Plugin 同时启动各渠道，并注入 `connection`、`credentials`、`typertGateway`；渠道生产实例拥有连接 supervisor、配置/状态存储、Harness client、workspace/session 协调、access policy 和 delivery adapter。每个渠道通过 Cordis effect 清理连接，delivery adapter 的 Registration 也在关闭时撤销。

这意味着直接安装 dsh-im 可以复用：

- 多账号 Bot onboarding、连接测试、重连与 health；
- Feishu/Lark、Slack、Discord 等平台 SDK/协议细节；
- DSH credentials 使用、非秘密配置投影；
- 消息/文件/卡片/交互的渠道原生呈现；
- 已有设置 UI 与多 Bot 管理；
- 现有 conversation route、workspace 与 DSH Session 处理。

最后一项对独立 dsh-im 很有价值，但正是它与 BotHarness execution model 冲突的地方。

### 2. 当前公开 Host Service 只覆盖主动投递

`plugin-src/host/index.mjs` 通过 `ctx.provide('dshIm', …)` 暴露：

```ts
interface DshImHost {
  send(
    botId: string,
    targetId: string,
    text: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ sent: true }>;
  listTargets(botId: string): Promise<DeliveryTarget[]>;
  listBots(): Promise<Array<{ botId: string; channel: string }>>;
}
```

`botId + targetId` 是稳定调用标识；目标把 provider-native route 保存在 dsh-im 的 workspace store 中。当前投递只承诺平台 API 接受或 SDK 成功返回：不保存投递历史、没有 `deliveryHandle`/`idempotencyKey`、不自动重试，超时重试可能重复，公开成功结果没有 provider message id。

所以它适合成为 BotHarness **Provider Operation** 的第一版执行器，但不能替代 BotHarness 的 Outbox Intent、attempt、receipt/unknown-outcome 与授权。

删除并重新接入 dsh-im Bot 会清理原 targets，调用方需要重新复制 `botId` 并配置目标。BotHarness 发现 opaque reference 失效时必须把 Bridge Connection 标为 `degraded / rebind-required`，不能按显示名、App ID 或“最近 Bot”静默重绑。dsh-im 另有无鉴权的 Host HTTP 投递端点；BotHarness 不需要它，只消费 same-Host Cordis Service。

### 3. 当前公开 Client Service 只覆盖管理面板嵌入

`dshImClient` v1 提供 `render()`、`setSettingsVisible()`、`settingsVisible()`。宿主可以嵌入完整 IM 管理面板；原设置入口仍默认保留。它不注册 BotHarness/桌面私有 sidebar slot，也不改变 Host 权限。

该面板适合作为 v1.1 的 **Provider Setup / Advanced** 入口，但不能成为 PersonaBot Binding 的 authority：

- 面板包含 dsh-im 自己的 workspace、model、Agent Preset、Session 与 target 管理；
- V1 只面向一个活跃管理面板，不同步多个嵌入副本；
- 它没有 PersonaBot/Channel/Inbox/Grant 语义。

BotHarness 应提供自己的 Bridge Connection 与 Binding UI；只有在替代入口和内容都可访问后，才隐藏 dsh-im 原设置入口。

### 4. 入站消息当前直接落到 dsh-im 自有 Session mapping

共享 `text-harness-bridge.mjs` 对 provider message id 去重后，计算 `conversationKey`，最终调用 `askInWorkspaceSession()`。`workspace-session.mjs` 会：

1. 从 dsh-im state 读取 `state.sessionFor(conversationKey)`；
2. 不存在时直接 `harness.createSession({ conversationKey })`；
3. 用 `state.setSession(conversationKey, sessionId)` 持久化映射；
4. 直接调用该 Session 的 `ask()`；
5. 把答案经当前渠道 reply target 发回。

dsh-im 的 `/new`、`/session`、`/conv`、workspace/model/preset 命令同样围绕这份 mapping 工作。它没有公开 authenticated inbound event subscription，也没有“只 transport、不驱动 Harness”的账号模式。

这与 BotHarness 的权威链冲突：PersonaBot 的外部消息必须先成为 immutable Source Event，再经 Channel/Admission 进入 Bot Inbox，由唯一 Orchestrator Session 决定回复或 Assignment。一个 external conversation 也不等于一个 DSH Session。

### 5. dsh-im 自己拥有多份非秘密运行配置和路由状态

以 Feishu 为例，生产路径在 `$DSH_HOME/integrations/dsh-feishu/` 下持有 `config.json`、`workspaces.json` 和 per-bot `state.json`：

- `config.json` 保存 bot id、app id、secret ref、owner、domain 与行为设置；
- `workspaces.json` 保存 workspace、conversation workspace、access policy、delivery targets 与 session sync；
- `state.json` 保存 conversation → Session 等运行映射。

Feishu App Secret 正确进入 DSH credential provider，不写这些文件；这是值得保留的安全实践。但这些 JSON 仍是 dsh-im 产品自己的 routing/session authority。BotHarness 不应再次把它们读成 PersonaBot Binding 或 Messaging authority；ADR-0011 中“读取 base stores 识别 Bot”的旧耦合应只视为迁移期兼容路径，不能扩展成 v1.1 主链。

### 6. 包兼容性需要单独验证

本次快照的 package compatibility 列表只明确写到 DSH `0.1.5-alpha.1`；BotHarness 本地开发基线是 `0.1.5-rc.2`，技能验证还覆盖 `0.1.6-alpha.2`。这不等于已知不兼容，但意味着安装前必须做真实 Profile smoke test，不能把 README 的旧兼容声明当作当前 Host/Client/API Gateway 事实。

## 三个方案比较

| 方案                                              | 优点                                                             | 主要问题                                                                                                                             | 结论                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| A. 直接把 dsh-im Bot/Session 绑定为 PersonaBot    | 最快得到多渠道、UI、回复与平台交互                               | dsh-im 直接拥有 conversation→Session、workspace、access、target 与 reply；绕过 Source Event/Bot Inbox/Orchestrator，形成双 authority | **不作为 canonical v1.1**；只允许 legacy/diagnostic mode |
| B. 完全照 Letta 重做 Connections + adapters       | 模型干净、PersonaBot 原生                                        | 重建 dsh-im 已有 SDK、onboarding、重连、UI、渠道呈现，成本与风险最高                                                                 | **不做**；Letta 只作分层参考                             |
| C. BotHarness 控制面 + dsh-im provider/data plane | 最大复用平台能力，同时保住 PersonaBot execution 与 durable facts | 需要补 inbound ownership seam，并验证版本兼容                                                                                        | **推荐**                                                 |

## 推荐架构

```text
dsh-im Plugin/Fiber
  platform SDK / listener / reconnect / native presentation
            │
            │ exclusive authenticated inbound consumer + provider operations
            ▼
BotHarness Messaging Provider Registration
            │
            ├─ Bridge Connection (provider account/config/health)
            ├─ Binding (external scope → PersonaBot + Channel + policy)
            └─ Messaging Ingress transaction
                 Source Event → Channel → Inbox Admission → Bot Inbox
                                                        │
                                                        ▼
                                             Orchestrator Session
                                                        │
                    Reply/Service Action → Outbox Intent│
                                                        ▼
                                      dsh-im provider operation → platform
```

### BotHarness owns

- **Bridge Connection**：provider/account identity、credential reference、health/capability snapshot；
- **Binding**：`Bridge Connection + external scope selector → PersonaBot + Channel + policies`；
- Source Event、Revision、Channel placement、Inbox Admission/Attention；
- trusted event-scoped Reply Route；
- Outbox Intent、attempt、receipt/failure/unknown-outcome；
- Access/Wake/Delivery Policy 与 Service Grant；
- PersonaBot/Orchestrator/Assignment execution。

### dsh-im owns

- provider SDK、socket/webhook/long polling、重连与 native account session；
- verified platform identity extraction 与 provider-native route parsing；
- attachment download/upload 与渠道原生 presentation；
- 平台 capability/health；
- credential material 的 Host-side resolution（通过 DSH credentials）。

### 必须向 dsh-im 补的稳定 seam

优先上游贡献，而不是 import `src/**`：

1. **Exclusive inbound consumer Registration**：按 provider account 获得唯一处理权；Registration 随 consumer Fiber dispose 撤销。
2. **Consumer mode**：每个 Bot 显式持久化 `standalone | external-consumer`。被 BotHarness 接管后，dsh-im 不再执行 `askInWorkspaceSession()`、不创建/切换 DSH Session、不运行会改变 Session/workspace 的 IM slash commands；consumer Registration 消失时 fail closed，绝不能自动退回 standalone，否则会绕过 policy 并造成双回复。
3. **Authenticated normalized evidence**：account fingerprint、event/message id、Actor、conversation/thread/root/reply、content/attachment locators、own-sender/echo correlation、non-secret reply locator、capabilities。
4. **Durable-accept acknowledgement**：只有 BotHarness ingress transaction commit 后才 ack；若 provider 可 replay/resume，暴露 cursor/sequence；否则 health 明示 gap 风险。
5. **Reply operation**：能对可信 reply locator 发送，而不是要求先把每个入站 route 人工保存成 `targetId`。
6. **Operation outcome**：尽可能返回 provider message id/receipt；超时必须能表达 unknown outcome；provider 支持时暴露幂等或 outcome lookup。

如果上游接受设计但正式版本尚未发布，只有在新增 ADR 明确退出条件后，才可用固定 upstream commit 的**临时最小 fork**验证 TB1：只在进入现有 Harness bridge 前增加 exclusive consumer branch，并暴露 ingress/reply facade，不修改渠道 SDK、连接、重连或 native presentation；用 facade contract、standalone parity、lifecycle 与 duplicate tests 保护。上游若拒绝这类 seam，则改为 BotHarness 自己实现 Feishu/Lark Provider Plugin并复用其设计/测试经验。无论哪条路径，都不要让同一 app/bot credential 同时启动两个 listener，不使用长期 deep import 或大型复制式 fork。

## “PersonaBot 可以发消息”的近期可交付切片

这件事比完整入站 Bridge 更窄，可以先做：

### TB0：只出站的 dsh-im Provider Operation

1. Profile pin 并安装已验证版本的 dsh-im。
2. BotHarness 新增 optional consumer Plugin，`inject: ['dshIm']`；探测 service/version/capabilities，缺失时明确 unavailable。
3. Human 在 dsh-im 面板完成 provider Bot 与 `targetId` 测试；BotHarness 保存的 Bridge Connection 只引用 `providerBotId + targetId`，不复制 secret/native route。
4. Human 把该 target 绑定到一个 PersonaBot，并授予 proactive messaging Service Grant。
5. 第一条资料页路径由 Human 明确点击发送；Host 先写 Outbox Intent，accept 与 execute 时各校验 active state、Binding、Grant、live Registration、authenticated account fingerprint 和 target content digest，再调用兼容公开 Service 的 `sendChecked()`。模型发起的 Service Action 留到后续切片。
6. `{ sent: true }` 只记录为“provider accepted”，不记为 delivered/read；timeout 记 unknown-outcome，不自动盲重试。

TB0 证明“Bot 可以主动发消息”，但它**不是双向 Channel 完成态**，也不能用来回复尚未保存为 dsh-im target 的新入站消息。

### TB1：Feishu/Lark DM 双向 Bridge

在 exclusive inbound consumer seam 可用后，走真实：

```text
Feishu/Lark DM → dsh-im listener → BotHarness durable ingress
→ PersonaBot Bot Inbox → Orchestrator → Outbox Intent
→ trusted reply operation → same DM
```

验收必须包含 duplicate/restart、未授权 sender、错误 PersonaBot binding、provider dispose、credential rotation 与 Human 真实客户端路径。

### TB2：Slack 或 Discord second-provider proof

只增加 Registration/config/capability fixtures，不改 Messaging tables/主链；验证 thread route 不串线。通过后才证明 core 真正 provider-neutral。

## Issue/ADR implications

- 保留 ADR-0001“dsh-im 作为 base plugin”与 ADR-0011“独立 Plugin、不 fork”结论。
- 修正 ADR-0011 的历史性实现假设：不再把读取 dsh-im private stores 作为 v1.1 稳定边界；新增 upstream Service seam 或独立 Provider Plugin。
- #46 继续拥有 Messaging deep module、Provider Registry、Ingress 与 Outbox authority。
- #48 应明确 dsh-im 是首选 transport provider，并把 TB0 与 inbound seam gate 写入 scope。
- #78 继续用 Feishu/Lark 官方文档和 sandbox evidence定义 provider contract；dsh-im 源码只能证明现有实现行为，不能替代平台官方能力事实。

## Adoption checklist

- [x] 在 BotHarness pin 的 DSH `0.2.0-rc.1` 隔离 Profile 安装并验证 native settings、`dshIm`、Typert/API Gateway、Host restart 与资料页；契约扩展仍为本地源码补丁。
- [ ] 明确 dsh-im package version、DSH version 与 upstream commit；升级有 contract/smoke tests。
- [ ] TB0 不读取 dsh-im JSON、不 import private `src/**`、不复制 credential/native route。
- [ ] PersonaBot Binding 只由 BotHarness command/deep module 修改；dsh-im settings 不自动改变 Binding。
- [ ] Outbox 对 dsh-im 当前 `{ sent: true }` 使用 accepted 语义，并覆盖 abort/timeout/duplicate risk。
- [ ] 设计并向上游提交 exclusive inbound consumer/provider-mode proposal；未落地前不宣称双向 Bridge。
- [ ] dsh-im Bot 删除/重建或 target 丢失时标记 `rebind-required`，不按名称/App ID 猜测新绑定。
- [ ] 一个 provider account 只有一个 listener owner；native dsh-im session mode 与 BotHarness consumer mode 不能并行。
- [ ] Provider Fiber dispose 后 inbound Registration、connection 与 operations 一起失效；其他 provider 不受影响。
- [ ] credential secret 只在 Host 由 DSH credentials resolve，不进 botharness.db、RPC、日志或 Client。
- [ ] 第二 provider 不引入 core provider branch 或第二份 routing/session authority。

## 2026-10-01 outbound slice verification

- BotHarness：1367 项测试通过、1 项跳过；lint、format、typecheck、双语 Release Ledger、Skill Ledger、build 和 docs build 通过。
- 本地 dsh-im 契约补丁：3453 项测试通过，无跳过；build 和 package artifacts verification 通过。尚未提交上游、发布或成为生产依赖。
- 真实 Lark 账号通过新公开 `describeBot` 被发现；资料页可选账号和已保存本人目标。没有创建真实账号 Grant，也没有通过新资料页再次发送。
- Native UI 展示实例以无凭据的测试 Provider 验证明确授权 → canonical Intent/attempt → accepted → 刷新不重发；这是 Host/RPC/Client 回归证据，不能替代平台收件证明。
- 已获 Human 收件确认的第一条真实消息来自之前单次授权的同 Host facade probe；新 checked contract + canonical Outbox 的真实收件验收仍待 Human 在资料页操作。接收、自动唤醒、双向回复尚未验收。

## Sources

- [dsh-im Host Plugin / `dshIm` Service](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/plugin-src/host/index.mjs)
- [dsh-im Delivery Service](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/plugin-src/host/delivery-service.mjs)
- [dsh-im proactive delivery contract](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/PROACTIVE_DELIVERY.md)
- [dsh-im Client integration contract](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/docs/client-integration.md)
- [dsh-im shared inbound bridge](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/src/channels/shared/text-harness-bridge.mjs)
- [conversation → DSH Session binding](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/src/channels/shared/workspace-session.mjs)
- [Feishu production composition and local stores](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/plugin-src/host/channels/feishu/production.mjs)
- [Feishu DSH credential adapter](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/plugin-src/host/channels/feishu/credential-store.mjs)
- [shared Bot workspace/target/access store](https://github.com/xmanrui/dsh-im/blob/42776b5beb4b304afbca0c8703d647cb59614df0/src/channels/shared/bot-workspace-store.mjs)
- [dsh-im issue #65: Host proactive send Service](https://github.com/xmanrui/dsh-im/issues/65)
- [dsh-im issue #231: embeddable Client management panel](https://github.com/xmanrui/dsh-im/issues/231)
- [ADR-0001: adopt dsh-im as base plugin](../decisions/im-providers.md#adr-0001)
- [ADR-0011: standalone plugin, not a dsh-im fork](../decisions/im-providers.md#adr-0011)
- [Letta Channels bridge research](./2026-09-21-letta-channels-external-im-bridge.md)
