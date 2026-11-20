# Letta Channels 与 BotHarness 外部 IM Bridge 设计调研

日期：2026-09-21

范围：Letta 当前 Desktop/Channels、Slack、Discord、Telegram 与 Custom Channel 的公开设计；据此为 BotHarness v1.1 的 Discord、Slack、飞书/Lark 外部消息桥接选择产品边界、DSH/Cordis seam、tracer bullets 与验收标准。只使用 Letta 官方文档、官方文档镜像和官方源码；飞书/Lark 的细节复用仓库现有一手资料调研，不重复做 provider API 枚举。

## 来源基线

- Letta Code：[`6fa735994`](https://github.com/letta-ai/letta-code/tree/6fa735994a46f1162f7c974ceed2a7fc95d62bb7)，版本提交为 0.32.14。
- Letta 官方文档镜像：[`65d875ed`](https://github.com/letta-ai/letta-docs-md/tree/65d875ed773a22ee54abde3032c61fd589c5a013)。
- BotHarness 的产品语义以 [`GLOSSARY.md`](../../GLOSSARY.md) 为准；目标所有权与事务边界以 [`botharness-architecture.md`](../architecture/botharness-architecture.md) 为准。
- 飞书/Lark 消息 edit/recall 的官方证据及当前 DSH 社区 adapter 覆盖见 [`2026-09-20-feishu-message-edit-recall-events.md`](./2026-09-20-feishu-message-edit-recall-events.md)。

## 摘要结论

Letta 已验证一个可用的外部消息主链：平台 listener → channel adapter → 中央 registry/access/routing → agent queue → agent 显式调用 `MessageChannel` → adapter 发送；Desktop 负责配置与旁观外部会话，而不是成为消息 transport。[官方 Channels 架构](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/configuration/channels/index.md)；[Desktop app](https://docs.letta.com/platform/desktop-app)

BotHarness 应借鉴这条分层和统一 provider contract，但不能照搬 Letta 的核心映射。Letta route 把平台 chat/thread 直接绑定到 `agent + conversation`；BotHarness 的 Bridge 应把 provider 事件写成唯一内容权威 **Source Event**，放入 **Channel**，再由 **Inbox Trigger** 建立 **Inbox Admission**，经 **Bot Inbox** 交给一个 PersonaBot 的 **Orchestrator Session**。外部 thread 不是 Assignment Session，provider adapter 也不能直接唤醒 Agent。

推荐 v1.1 先交付两颗生产形状的 tracer bullet：第一颗用飞书/Lark 打通真实 DM 收发和 durable authority；第二颗接入 Slack 或 Discord，要求只新增 provider Registration/Provider 实现，不修改 Messaging 核心 schema 和 Orchestrator 入口。第二颗通过，才能证明这是 multi-provider Bridge，而不是飞书特例。

## Letta 当前设计：可验证事实

### 1. Channel 是通信面，不是 skill

Letta 明确区分 skill 与 channel：skill 是可复用能力，channel 是 inbound、outbound、account routing 和 pairing 的实时通信介质。Custom Channel 作为本地 adapter 运行，收到平台事件后调用 `adapter.onMessage`，而 outbound 通过共享 `MessageChannel` tool 的 channel-owned action 执行。[Custom Channels](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/configuration/channels/custom/index.md)；[Channel plugin contract](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/channels/README.md)

Letta 的 `ChannelAdapter` 统一了 listener 生命周期、发送、direct reply、可选 attachment/context/progress/control hooks 和 `onMessage` ingress；`InboundChannelMessage` 则规范化 account、chat、sender、message、thread、timestamp、attachments、reaction、reply/thread context 等字段。[types.ts](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/channels/types.ts)

Custom plugin 通过 metadata、`createAdapter(account)` 和可选 `messageActions` 注册。消息 action 仍共享一个顶层 `MessageChannel` tool，provider plugin 只贡献 action discovery/schema 与执行逻辑。[plugin-types.ts](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/channels/plugin-types.ts)

### 2. 中央策略先于 routing，inbound 与 outbound 分离

Letta 在每条 inbound 上中央执行 sender access，再处理命令和 routing；DM 有 `pairing | allowlist | open`，group/channel 另有 sender policy，管理命令还可分 admin/user tier。[Channels access control](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/configuration/channels/index.md)

进入 agent 并不等于已经回复。Inbound 被格式化为 `<channel-notification>` 并进入会话；agent 必须显式调用 `MessageChannel` 才会产生外部回复。官方调试顺序也把「收到 notification」「调用 tool」「tool send 成功」「route/account 一致」拆成不同检查点。[Channel plugin contract](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/channels/README.md)；[XML projection](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/channels/xml.ts)

Letta 还抑制相邻的相同 outbound action，包括 in-flight 和上一条已成功的相同 send；但这是 turn-local 的防重复，不是跨重启的外部 exactly-once 保证。[message-channel-idempotency.ts](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/channels/message-channel-idempotency.ts)

### 3. 平台 routing 语义不同，不能被一个 `chat_id` 粗暴抹平

- Slack 使用 Socket Mode。App 先绑定一个 agent；channel 中每次新 mention 创建新 conversation，回复进入 thread，后续 thread 消息继续该 conversation；每个 DM 自动建立 1:1 conversation route。[Slack channel](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/configuration/channels/slack/index.md)
- Discord 使用 Gateway WebSocket。Bot 同样先绑定一个 agent；mention 可创建 thread/conversation，DM 自动路由；guild channel 可为 `mention-only` 或谨慎开启 ambient `open`。[Discord channel](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/configuration/channels/discord/index.md)
- Telegram 使用 long polling；默认先 pairing，再显式绑定到 agent/conversation。[Telegram channel](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/configuration/channels/telegram/index.md)

因此 provider contract 必须保留 account、platform conversation、thread/root/reply、sender 与 provider message identity；`Channel` 的规范化不应丢掉 provider-native routing evidence。

### 4. Desktop 是控制面与观察面

Letta Desktop 的 Channels 页面允许启停、配置管理权限并直接打开会话；所有外部收发会话与 direct chats 一起出现在 sidebar，包含多人 thread。Agent 可运行在本机或远端 computer，Desktop 选择目标并查看同一状态。[Desktop app](https://docs.letta.com/platform/desktop-app)

第一方 Slack/Discord/Telegram 有 bespoke Desktop UI；用户自定义 channel 在当前 MVP 中是 headless，只能使用通用 account/config/routing 能力。这说明通用 contract 和 provider 专属设置 UI 应分开演进。[Channel plugin contract](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/channels/README.md)

### 5. Letta 的边界不足以直接成为 BotHarness authority

Letta route 本质上保存 `account/chat/thread → agent/conversation`；account、routing、pairing 以 channel 目录下文件持久化。连接短暂断开时 adapter 继续监听并在 WebSocket 重连前 buffer，官方文档称其后 flush。[ChannelRoute type](https://github.com/letta-ai/letta-code/blob/6fa735994a46f1162f7c974ceed2a7fc95d62bb7/src/channels/types.ts)；[Channels lifecycle](https://github.com/letta-ai/letta-docs-md/blob/65d875ed773a22ee54abde3032c61fd589c5a013/configuration/channels/index.md)

这对 Letta 足够，但 BotHarness 已要求 Source Event、policy revision、Inbox Admission、Outbox Intent、attempt/outcome 与 unknown outcome 都是 durable application facts。因此 Letta 是 adapter/routing 参考，不是 BotHarness persistence model。

## BotHarness 的关键 divergence

| 关注点       | Letta                                         | BotHarness v1.1 应采用                                                                                         |
| ------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 产品入口     | channel route 直达 agent conversation         | Bridge 只把 verified event 交给 Messaging；Source Event → Channel → Inbox Admission → Bot Inbox                |
| 运行会话     | 平台 chat/thread 可直接创建 conversation      | 每个 PersonaBot 至多一个 active Orchestrator Session；Assignment Session 只能由 Orchestrator 显式创建/复用     |
| 内容权威     | agent conversation notification + route files | `botharness.db` 中 immutable Source Event；Channel/Inbox 只存关系                                              |
| 回复目的地   | tool input 携带 channel/chat                  | 从触发 Source Event 的可信 Reply Route 选择 provider/account/target；模型不能自由改写 reply destination        |
| 主动发送     | 与 MessageChannel action 同一工具面           | 独立 Service Action；Provider Capability 与 Human Service Grant 双重校验                                       |
| 外部副作用   | adapter send，局部 duplicate suppression      | durable Outbox Intent + stable idempotency identity + attempt/receipt/failure/unknown-outcome                  |
| adapter 授权 | channel account DM/group policies             | adapter 验证 provider 身份；BotHarness Access policy、Inbox Trigger、Wake Policy 与 Service Grant 各自拥有规则 |
| 凭据         | channel account config 可含 token             | 只保存 Credential reference；secret 留在 DSH credentials service                                               |
| UI           | Channel setup + 外部 conversation 可见        | Roster 中 Channel/DM 可见；Settings UI 管 Bridge/provider account；UI 只读 Host projection、发 command         |

最重要的不变量是：**Bridge 不拥有 Inbox Trigger，也不调用 Agent；外部 thread 不自动变成 Assignment；Provider Capability 不等于 Service Grant；Reply 不等于 proactive Service Action。**

## 推荐架构与 DSH/Cordis seams

```text
provider webhook / socket / long connection
  -> Provider Adapter (verified identity + normalized evidence)
  -> Messaging Ingress Service
  -> transaction: Source Event / Revision or Echo correlation
                  + Channel placement
                  + exact policy revision
                  + Inbox Admission / Attention facts
  -> commit
  -> process-local post-commit notification
  -> Wake/Delivery policy
  -> DSH Agent Inbox at a verified safe boundary
  -> Orchestrator Session observes model-visible input
  -> Reply command or authorized Service Action
  -> Outbox Intent -> Provider Operation Service -> receipt/outcome
```

### 责任到 seam 的映射

| 责任                                   | 主 seam                                                                  | 所有权与 durability                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Slack/Discord/Feishu listener 生命周期 | DSH **Plugin/Fiber**                                                     | Provider Plugin 的 Fiber 拥有 socket/webhook/long connection、重连与 cleanup；不是 durable authority                   |
| 当前可用 provider 实现                 | application-defined **Registry + Registration**                          | 每个 provider Plugin 注册 metadata、capabilities、account factory/operation Provider；Fiber disposal 撤销 Registration |
| 写入 verified inbound                  | application-defined **Messaging Ingress Service Definition**             | adapter 是 Consumer；Messaging Provider 在一个 SQLite transaction 中拥有 Source Event 与 policy/admission invariants   |
| provider reply/post/fetch/reconcile    | application-defined **Provider Operation Service Definition + Provider** | named operation 有结果、错误、取消与 idempotency semantics；Messaging/Outbox 是 Consumer                               |
| durable 消息事实                       | application-owned persistence boundary                                   | `botharness.db`；不是 Cordis Event，也不是把全量 Channel 复制成 SessionEvent                                           |
| 刚提交的新 attention                   | **Cordis Event** 或内部 post-commit notifier                             | 只在 commit 后发；用于 process-local reaction，重启可从 durable pending projection 补偿                                |
| Orchestrator 可见输入                  | DSH **Agent Inbox** + **SessionEvent**                                   | Delivery Policy 选择安全 turn/step 边界；真正进入模型的表示成为 DSH execution history                                  |
| 当前 unread/attention/channel 列表     | application-defined **Projection**                                       | 从 Source Event、Channel placement、Admission/Decision facts重建                                                       |
| Host → browser                         | **TypertRemoteService → API Gateway**                                    | Client bridge 提供 query/command；不新增 `/api` interceptor                                                            |
| Roster/Settings/Channel detail UI      | browser **Slots**                                                        | Client Plugin 注册 UI；不直接读 DB、credential 或 provider SDK                                                         |

Provider Registry 是 profile/runtime 级 composition，不用 Agent Scope 来表达授权。某 PersonaBot 能否看到或执行 provider action，必须由 Access policy、Inbox Trigger、Provider Capability 与 Service Grant 判定；Agent Scope 只在确实需要控制某类 Tool Registration 可见性时作为另一条独立轴。

### 建议的最小 provider contract

稳定 contract 只规范化 core 真正需要的 evidence，不追求所有平台字段的最低公分母：

- provider id、Provider Account Fingerprint、Bridge id；
- provider event/message id、event kind、provider timestamp、可选 revision/version；
- authenticated Actor identity 与 display metadata；
- platform conversation identity、surface kind（DM/group）、thread/root/reply identities；
- content parts 与 attachment locators；
- echo/own-sender evidence；
- advertised Provider Capabilities；
- 可构造 Reply Route 的非秘密 locator；
- adapter 原始 payload 的受限审计引用或哈希，而不是把任意 raw object 暴露给 model/UI。

Provider-specific extras 留在 namespaced evidence 中。Core 只依赖已声明 capability；例如 recall、current-message fetch、reaction、streaming、proactive post 都必须可缺席。

## 风险与设计约束

1. **重复、乱序与重放。** Socket/webhook/long polling 都可能重投。原始消息以 `(provider account fingerprint, provider message/event identity)` 幂等；revision 用 provider version/update time 或 deterministic revision hash，不能只按 message id 丢弃。
2. **provider echo 形成 ping-pong。** Outbound 必须记录 provider correlation；匹配到自己的 inbound echo 时 enrich 原 Source Event/receipt，不产生新 attention。无法匹配的 own-sender echo 保留为 unresolved 且不得 wake。
3. **thread 语义错配。** Slack `channel + thread_ts`、Discord parent/thread、飞书 root/parent/thread 不能压成一个不透明 chat id。Reply Route 要保存当时的可信 routing evidence。
4. **模型越权选目的地。** Reply destination 由 Source Event 决定；任意 target send 是另一个 Service Action，重新验证 Grant。不要把 Letta 的通用 `channel + chat_id` reply 参数原样交给模型。
5. **断线期间只靠内存 buffer。** Adapter buffer 可改善短断线，但不可成为 durability。Provider 能确认 receipt 的事件应先 durable ingest；无法补拉的平台需要暴露 gap/health，而不是宣称无丢失。
6. **双 listener / split brain。** 一个 profile 的 Profile Writer Lease 与 Bridge listener ownership 必须一致；第二 Host 不能同时接收或发送同一 provider authority。
7. **凭据和 raw payload 泄露。** Secret 只经 credential reference 注入 Provider；Client projection、日志、Source Event provenance 与 provider config snapshot 必须 redacted。
8. **ambient group 噪音与费用。** 默认 mention/explicit trigger，先验证 Actor/Channel access，再决定 Admission/Wake。`open` ambient 模式必须显式 opt-in 且有速率、debounce/digest 与可观察丢弃原因。
9. **外部副作用结果不确定。** Timeout 不能自动等于 failure；Outbox 进入 unknown-outcome 后停止自动重试，等待 provider reconcile 或 Human。
10. **把 transport 事实误当 Session history。** Source Event 是 Messaging authority；只有 Orchestrator 实际 Observation 的模型可见表示才进入 Session execution history。

## v1.1 tracer bullets

### TB1：飞书/Lark DM 的最窄生产闭环

一个已配置的飞书/Lark Bridge 接收一条 Human DM，authenticated adapter 规范化并写入 Source Event；事件放入 DM Channel，经一个明确 Inbox Trigger 进入 PersonaBot 的 Bot Inbox，在 Delivery Policy 选择的安全边界唤醒其 Orchestrator Session；Orchestrator 发出 Reply，Host 从 Source Event 的 Reply Route 选择同一 provider/account/chat，写 Outbox Intent 后执行并记录 receipt。

必须同时交付：

- 一个真实 provider connection 与 credential reference；
- duplicate inbound 不产生第二个 Source Event/Attention；
- 非授权 sender 不进入 Bot Inbox；
- Host restart 后 pending Admission 或 Outbox 可有界 reconcile；
- Roster/DM view 能看到外部消息、来源、pending/read 与 send outcome；Settings 能看 Bridge health，但看不到 secret；
- focused automated tests 加一条 Human 可实际发 DM 并看到回复的 runtime path。

先不包含 group ambient、edit/reaction、attachment、rich card、slash command、streaming response 和 proactive post。

### TB2：第二 provider 证明 core 真正通用

接入 Slack **或** Discord，同样完成 mention/DM → Source Event → Bot Inbox → Orchestrator → threaded Reply。要求只新增 Provider Plugin/Registration、provider config/设置投影和 capability-specific tests；不得新增 provider-specific Messaging tables、绕过 Messaging Ingress、直接绑定 DSH Session，或在 core 中出现 `if provider === ...` routing。

验收时至少覆盖：

- Slack `channel + thread` 或 Discord `parent channel + thread` 保持稳定，后续 thread 消息仍进入同一 BotHarness Channel/attention 语义；
- 同一 PersonaBot 可同时绑定飞书/Lark与第二 provider，两个来源进入同一个 Bot Inbox/Orchestrator，但各自 Reply Route 不串线；
- provider Plugin stop/dispose 后 listener 与 Registration 都消失，其他 provider 继续工作；
- 第二 provider 缺少某 capability 时 core 降级而非假装支持。

这颗 bullet 通过后，再决定 v1.1 是否扩到 Discord 与 Slack 两者；不要先平行实现三个大 adapter。

### TB3：可靠性与 group/thread 扩展

在前两颗闭环经 Human 验证后，再加入 group mention、bounded debounce/digest、attachment locator、recall/revision capability、outbox reconciliation 和 operational commands。每一项都沿同一 durable authority 与 provider capability seam 扩展，不另建 transport-owned inbox 或第二 routing store。

## 可直接放入 issue 的验收标准

- [ ] Provider adapter 不能直接创建/wake Agent；所有 inbound 经过 Messaging Ingress transaction。
- [ ] 每条 accepted inbound 有唯一 Source Event；Channel placement 与 Inbox Admission 只引用它，不复制正文。
- [ ] Actor、provider account、conversation/thread 与 message identity 都来自 authenticated adapter evidence，不信任 caller/model 输入。
- [ ] Duplicate/replay、Provider Echo、revision 分别有可测试的不同结果。
- [ ] Orchestrator 只在 Wake/Delivery Policy 允许的安全边界 Observation；普通消息不取消当前 model/tool step。
- [ ] Reply 从触发事件的 Reply Route 选 destination；任意 proactive target 必须走 Service Action + Service Grant。
- [ ] 每个 outbound 先有 Outbox Intent，随后记录 attempt 和 receipt/failure/unknown-outcome；无 exactly-once 宣称。
- [ ] Credential secret 不进入 repo、config snapshot、日志、Source Event、RPC 或 Client。
- [ ] Provider Registration 随 Fiber 生命周期撤销；一个 provider 故障不阻断其他 provider。
- [ ] Client 只经 Typert/API Gateway 读取 projection 和发 command，UI 不直接读数据库或 provider SDK。
- [ ] 飞书/Lark完成一条真实 DM tracer bullet；Slack/Discord 至少一个作为第二 provider 在不改 core schema/主链的前提下通过同一验收。
- [ ] 每颗 bullet 都有 focused automated coverage、restart/replay case 和 Human 可执行的 runtime verification。

## 建议的 v1.1 issue 拆分

1. **Epic：External IM Bridge v1.1** — 固定上述不变量、范围与 TB1/TB2 gate。
2. **Core contract：Messaging ingress、provider Registry、Reply Route 与 Outbox seam** — 不含 provider UI 大全。
3. **TB1：Feishu/Lark DM end-to-end** — 复用现有 adapter 经验，但让 BotHarness Messaging 成为 authority。
4. **TB2：Slack 或 Discord second-provider proof** — 以“core 无 provider branch”为硬验收。
5. **Bridge settings + Channel observability** — Typert read/command、redacted account health、DM/Channel projection。
6. **Reliability/security gate** — replay/echo、restart reconciliation、writer/listener ownership、unknown outcome、secret audit。
7. **Deferred extensions** — group ambient、rich UI、slash commands、attachments、edit/recall/reaction、第三 provider；只在 tracer bullets 通过后拆出。

## 不应从 Letta 直接照搬的内容

- 不把 provider chat/thread 直接映射为 Orchestrator 或 Assignment Session。
- 不把 route/account JSON 文件当 BotHarness durable authority。
- 不让模型用自由的 `channel/chat_id` 参数决定 Reply 目的地。
- 不用 adapter 的 `open`/allowlist 代替 PersonaBot Access policy、Inbox Trigger、Wake Policy 与 Service Grant。
- 不用 Agent Scope 代替授权，也不让 provider plugin 直接注入 Client/Host 内部 Service。
- 不因为 Desktop 能显示外部 conversation，就把 Desktop 变成 listener 或消息数据库。

Letta 的真正启发不是复制它的 route table，而是保持 transport、policy、routing、agent delivery、outbound action 与 UI supervision 彼此可诊断。BotHarness 应在这条分层上保留自己更严格的 durable facts 与 PersonaBot execution model。
