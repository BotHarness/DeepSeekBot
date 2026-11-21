# Channel 消息流式渲染与聊天历史设计（SSE / Cursor 分页 / Markdown / 附件 / Reply）

Date: 2026-09-21
Status: 调研 + 设计提案（未实现、未决策；标注为「分析」的部分不是 DSH 保证的行为）
Related: `docs/research/2026-09-21-dsh-session-streaming-and-client-facts.md`（平台事实与引用）、ADR-0036/0037/0049、issue #124、#46、`docs/client-bridge.md`

## 0. 结论摘要

Channel 里的 bot 消息当前是「一次性 append、纯文本、无实时推送、无分页消费」：bot 的 `channel_send` 执行完才写入一条完整消息（`packages/core/src/runtime/bot-runtime.ts:432`），client 只在 `send()` 返回后整页重载（`packages/client/src/client/actions.ts:238-245`），并且 human 的发送 RPC 会一直 await 整个 Orchestrator turn（`packages/core/src/bridge/methods.ts:441-447`），所以用户停留期间既看不到自己消息的回显，也看不到 bot 的过程输出。DSH 原生 Session 之所以「有流式」，是因为它走的是另一条链路：`agent/assistant-stream`（进程内瞬态 chunk）→ `session/follow` → 浏览器 `assistant/live-chunk` → streaming Markdown（见 facts 文件 §A–E）。

要达成目标体验，需要四层各自补齐，且每一层都能独立成一个 tracer bullet：

1. **Live 通道**：Host 用 `ctx.connection.fetch.register` 注册一条精确 SSE 路由（唯一被官方允许的第三方浏览器流式出口；`/api` 的 interceptor 归 api-gateway，禁止插件接管），post-commit 广播 Channel/activity 变化；client 首次查询 snapshot、随后消费带 revision 的 live 帧，断档重查——沿用 ADR-0049 已经写下的模式。
2. **流式草稿**：Host 全局监听 `ctx.on('agent/assistant-stream', …, { global: true })`，跟踪 Orchestrator 对 `channel_send` 的 tool-call，随 `argumentsDelta` 增长提取 `body`，作为 **presentation-only、不落盘、不产生事件** 的 draft 帧广播；真正 append 后发 settle 帧，client 用 committed 消息替换 draft。这与 DSH 自己 `assistant/live-chunk` 的语义完全一致，也是对 ADR-0049「TTS/Live2D 不得消费未提交草稿」的遵守：草稿只进 UI，不进任何 durable consumer。
3. **Timeline read model + cursor 分页**：Channel 历史读取收敛成一个 deep module，对外只暴露 opaque cursor 的 `older / newer / around` 分页与 `hasOlder/hasNewer`；client 维护有界窗口，双向 lazy load + scroll anchoring，打开频道时围绕 last-read 载入 pre/post 区间。这样未来 NDJSON → Messaging SQLite（ADR-0037 / #46）的迁移对 client 不可见。
4. **消息形态**：`ChannelMessage` 加三个前向兼容可选字段——`format?: 'markdown' | 'text'`、`replyTo?`、`attachments?`；Markdown 渲染直接复用 DSH 公开的 `MarkdownText`（`streaming` prop 自带增量解析、尾部两块增量 parse、fence 增量高亮），附件走 profile-scoped CAS + 同一 Fetch 路由的上传/下载。

---

## 1. 当前实现事实（main，2026-09-21）

| 关注点      | 现状                                                                                                                                                                      | 位置                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 消息模型    | `{ id, at, author, body }` + 可选 `external{id, thread}`；无 format/replyTo/attachments                                                                                   | `packages/core/src/channels/channel.ts:13-29`                              |
| 存储        | 每 Channel 一个 append-only `messages.ndjson`；`appendMessage` 单次写一行；`readMessages` 全量读文件后切片，默认 50 / 上限 200，`before` 是 message id；返回 newest-first | `packages/core/src/channels/store.ts`                                      |
| bot 回复    | `channel_send` tool → `#channelAccess.send` → `appendMessage`；一次写完整消息，**没有**中间态                                                                             | `dsh-bot-agent-adapter.ts:252-280`、`bot-runtime.ts:422-435`               |
| human 发送  | `methods.channelSend` append 后 `await runtime.handleDmMessage(...)`，即 RPC 要等整个 turn 结束才返回                                                                     | `packages/core/src/bridge/methods.ts:423-449`                              |
| client 行为 | `send()` await 整个 RPC，然后整页重载消息；composer 在整个 turn 期间是 `sending` 态                                                                                       | `packages/client/src/client/actions.ts:231-268`                            |
| 实时性      | **零**。store 是本地对象；无轮询/SSE/WebSocket；`BotStateTracker` 的 Cordis 事件无人订阅；别人的回复只有靠 send/reopen 触发重载才可见                                     | `packages/client/src/client/store.ts:168-238`、`state/bot-state.ts:83-111` |
| 分页消费    | Host 已支持 `before`/`limit`，但 client 从不传 `before`，没有 `loadOlder/loadMore`                                                                                        | `bridge.ts:355-362`、`methods.ts:401-421`                                  |
| 渲染        | `MessageBubble` 纯文本 `<div>{message.body}</div>`；无 markdown、无附件、无引用回复 UI                                                                                    | `packages/client/src/client/bot-main.tsx:67-105`                           |
| 滚动        | 每次 messages 变化无条件 `scrollTop = scrollHeight`                                                                                                                       | `bot-main.tsx:326-329`                                                     |
| 未来形态    | `body` 已有 `source_events` 表切片，但 Channel 历史权威尚未迁移；ADR-0030 已被 ADR-0037 取代（Messaging store = 单一 SQLite 事务）                                        | `bot-runtime.ts:294-346`、ADR-0037                                         |

## 2. 目标与硬约束

1. **权威边界不因 UI 而变**（ADR-0036/0037）：消息只有一个权威；草稿不是消息、不是 Source Event、不落盘、不参与 Inbox/Wake/Outbox。Orchestrator 的普通 assistant final 仍然只是执行历史；说话的唯一入口仍是显式 Channel messaging command。
2. **不做第二套事实**（ADR-0049）：live 只是「projection 改变后的进程内同步」；client 先查询、再消费带单调 revision 的更新，断档时重查而不是自己推导。
3. **不碰 `/api` interceptor**（AGENTS.md / `docs/client-bridge.md:20`）：浏览器流式只能走精确 Fetch 路由（`fetch.register`）或挂载 Remote contribution（后者仓库外可复现性未验证，见 facts 文件 §D.3）。
4. **为 ADR-0037 迁移留缝**：client 依赖的必须是 cursor 化的 read model，而不是 NDJSON 细节；未来换 store 不动 UI。
5. **DSH 原生视觉与 token**：渲染对齐 `dsh-ui` skill 与 ADR-0028；不引入自研 markdown/虚拟化依赖。

## 3. DSH 平台能力（详情与引用见 facts 文件）

- **两条流**：durable 的 `SessionEvent` 只在 step 结算提交（`assistant/message` 携带完整消息 + 紧凑 stream）；逐 chunk 的是 Cordis 事件 `agent/assistant-stream`（`start/chunk/end`，`chunk.chunk: StreamChunk`，含 `text-delta`、`reasoning-delta`、`tool-call-delta{id,name?,argumentsDelta}`）。插件可 `ctx.on('agent/assistant-stream', …, { global: true })` 观察；订阅是 effect，插件卸载自动清理。
- **组装可复用**：`@deepseek-ai/dsh-llm` 公开 `BlockAssembler`；流中调用 `blocks()` 能得到「按 delta 累积的开块」，`tool-call` block 的 `arguments` 是原始 JSON 字符串——正适合提取正在生成的 `body`。
- **浏览器流式出口**：`ctx.connection.fetch.register({ path, methods, requestBody, fetch })`，路径是 `/api` 之下的绝对路径；请求由 carrier 先做信任与鉴权（DSH 用签名 cookie，`BrowserAuth.isAuthenticated`），所以同源 `EventSource` 天然可用（端到端待 spike 验证）。响应是原生 `Response`，可 SSE / 可流式回包。
- **可复用渲染**：`MarkdownText`（公开导出）带 `streaming?: boolean`，流式期间冻结除尾部两块外的块；`labels` 必须引用稳定否则丢缓存；同包还有 `CodeBlock`/`DiffBlock`/`JsonBlock` 等。原生 chat 的 `AssistantMarkdown` 不是公开面，不要依赖。
- **无内建虚拟化**：原生 chat 用「分页 + scroll anchor + ResizeObserver」维持有界窗口；`loadOlder()` / `loadThrough(seq)` 是它的分页语义，没有自动无限滚动。分页请求是 message-aligned `{ throughSeq, beforeSeq?, maxMessages? } → { records, hasMore }`。

## 4. 设计

### 4.1 Host：一个 post-commit Channel live hub + 一条 SSE 路由

新增 Host 深模块 `ChannelLiveHub`（`packages/core/src/channels/live.ts`，示意）：

```ts
type LiveFrame =
  | { kind: 'message/committed'; channelId: string; message: ChannelMessage; cursor: string }
  | {
      kind: 'draft';
      channelId: string;
      draftId: string;
      attemptId: string;
      revision: number;
      body: string;
      state: 'composing' | 'complete';
    }
  | { kind: 'draft/settled'; channelId: string; draftId: string; messageId: string }
  | { kind: 'draft/abandoned'; channelId: string; draftId: string; reason?: string }
  | { kind: 'channel/updated'; channelId: string; updatedAt: string };
```

- **发布点**：只在 append/settle 之后。human 侧在 `methods.channelSend` commit 后、bot 侧在 `bot-runtime.#channelAccess.send` 返回后调用 `hub.publish(...)`；这就是 ADR-0037 要求的「Runtime notification happens only after commit」。
- **传输**：`ctx.connection.fetch.register({ path: '/botharness/stream', methods: ['GET'], requestBody: 'buffered', fetch })`，返回 `Content-Type: text/event-stream` 的 `ReadableStream`；每帧写 `id: <cursor>`，浏览器重连时自动带 `Last-Event-ID`，Host 据此从 durable store 补发 missed `message/committed`。draft 帧**不补发**（进程内瞬态，与 DSH 一致）。
- **多连接**：单用户 Host，先做「每条连接一个广播订阅 + 心跳注释帧」；不做 per-channel 订阅协议。
- **顺带修复发送语义**：`channelSend` 只 await commit，把 `runtime.handleDmMessage` 改为入队后异步执行（bot-runtime 已有 per-channel queue，`bot-runtime.ts:179-194`），失败通过 live 帧/activity 呈现。这正是 DSH Native 的语义：`channelSend` 提交后把消息作为 Bot Inbox 的 Source Event 入队，Orchestrator 已在运行时按 Agent inbox 的 `followup`（下一个 turn）消化，将来可加 `steer`（最近 step 边界）选项；对应原生证据 facts §H（`commands.ts:363-364`、`runtime-types.ts:204-241`）。client 侧像原生 `MessageItem` 一样先做 optimistic echo，等 committed 帧替换（facts §H）。这是流式体验的前提：human 消息立即回显，bot 过程输出随后到达，用户可以连续发送。
- **断档恢复**：client 记住每条 Channel 的 `cursor`（最后一条已提交消息的 cursor）；重连后对当前打开的 Channel 调一次 `page({ after: cursor })` 补差；SSE 只当加速器。这与 ADR-0049 的 revision 模式同构。

### 4.2 Host：`channel_send` 草稿生命周期（流式的核心）

数据流（全部进程内，不落盘）：

```text
Orchestrator Agent
  └─ agent/assistant-stream  chunk{ tool-call-delta, id, name:'channel_send', argumentsDelta }
        │  BlockAssembler.push(chunk).blocks() → 找 tool-call block
        │  tolerant-parse(block.arguments) 取 body / channel_id（可能不完整）
        ▼
  ChannelDraftTracker (per session+toolCallId)
        │  节流（~animation frame / 50ms）发布 { kind:'draft', state:'composing', body }
        │  channel_id 缺省时用 run 的 inbound channel；若最终值不同 → abandoned + 重新归属
        ▼
  channel_send tool execute → channels.send() → appendMessage commit
        │
        ├─ 先发 { kind:'draft/settled', draftId, messageId }
        └─ 再发 { kind:'message/committed', message }   ← 权威
```

- **关联键**：`(sessionId, toolCallId)` → `draftId`；Channel 归属来自 `channel_send` 的 `channel_id`，缺省用 `OrchestratorAgentRun` 的 inbound channel（`bot-runtime.ts:381-383` 的 `resolve`）。
- **`body` 提取**：`BlockAssembler` 已给出累积的原始 JSON 字符串；实现一个只认顶层 `body` 字符串字段的容错扫描（处理转义、未闭合引号、字段乱序），不要等完整 JSON 再发。若 provider 一次性给出全部 args（合法但退化），草稿只播一帧——功能仍正确。
- **结算与放弃**：`end{committed}` 且 tool 真正执行成功 → settle；`end{abandoned}`、tool 报错、turn 取消 → abandoned；Orchestrator 没有 `channel_send` 就直接结束 → 无草稿（符合 ADR-0036）。
- **单调性**：tool-call 的 `arguments` 是 delta 拼接（原生 `argsRaw = base.argsRaw + argumentsDelta`，facts §G），所以草稿正文是最终消息正文的**严格前缀**，只可能被整体放弃、不会被回溯改写（按当前 provider 协议；需在 spike 里对目标 provider 验证）。这使「提前消费」在语义上安全。
- **消费者分级（把 ADR-0049 的规则精确化，而不是绝对化）**：
  1. **Presentation consumers**：聊天 UI、trajectory 等可自由消费 draft；按 `attemptId + revision` 对齐、animation-frame 级节流、`settled` 时用权威消息替换、`abandoned` 时丢弃——即原生 chat 的做法（facts §G）。
  2. **Speculative consumers（TTS / 说话动画 / 其他延迟敏感且可丢弃的呈现）**：**可以**消费 draft，但必须显式 opt-in、按句子/片段切分、可被 `settled`（重新对齐或只补差）与 `abandoned`（回滚/静音）打断，且绝不把草稿写进任何持久层。
  3. **Durable / irreversible consumers**（Messaging 权威、Inbox/Wake、Outbox、Memory、Service Action）：**只认 committed**；draft 不参与、不落盘、不产生事件。原 ADR-0049 的禁令在这一类上完整保留。
- **不做的**：不持久化草稿、不做跨重启恢复、不把草稿写入任何权威。断线代价是「半截文本消失、下个 delta 继续」；若做 baseline recovery（下一条），也只服务 presentation。
- **可选 parity**：像 DSH `SessionHistoryController` 的 accumulator 一样，Host 为每个草稿保留最近一次 snapshot，新连接的 client 订阅时先收一次 baseline（仅内存、有上限）。建议放在 draft 切片之后做。

### 4.3 Channel Timeline read model：opaque cursor 的双向分页

把读取收敛为深模块（现在由 `ChannelStore.readMessages` 实现，未来由 Messaging store 实现），RPC/SSE 只依赖这个契约：

```ts
interface ChannelTimelinePage {
  entries: TimelineEntry[];       // 时间升序
  olderCursor: string | null;     // 向过去翻页
  newerCursor: string | null;     // 向未来翻页（断档补齐/新消息）
  hasOlder: boolean;
  hasNewer: boolean;
}

page(input: {
  channelId: string;
  limit?: number;                                   // 默认 50，上限 200
  direction?: 'older' | 'newer' | 'around';
  cursor?: string;                                  // older/newer 的锚
  around?: string; olderLimit?: number; newerLimit?: number;
}): ChannelTimelinePage;
```

- **cursor 不透明**：编码 `(at, id)`（现在也可只用 id），client 不得解析；换 store 时语义不变。
- **around** 支撑两个场景：打开频道时围绕 `lastReadCursor` 载入 pre/post 区间；点引用回复/搜索结果时跳转到目标消息。
- **现有实现的迁移**：`store.readMessages` 加 `after`/`around`（仍然全量读文件切片，先不优化）；给 NDJSON 加一个 tail-read 优化列为后续项（当前 `readMessages` 是 O(file)，>1 万条需要测量）。
- **Bridge 方法演进**：`channelMessages` 增加 `cursor/direction/around/olderLimit/newerLimit`，响应加 `olderCursor/newerCursor/hasOlder/hasNewer`；旧字段 `before` 保留兼容（`methods.ts:401-421`、`rpc.ts:148-153`）。

### 4.4 消息模型（前向兼容）

```ts
interface ChannelAttachmentRef {
  hash: string;
  name: string;
  mime: string;
  size: number;
}

interface ChannelMessage {
  id: string;
  at: string;
  author: ChannelMessageAuthor;
  body: string;
  format?: 'markdown' | 'text'; // bot/bridged 默认 markdown，human 默认 text
  replyTo?: string; // 同 Channel 的消息 id；读模型可附带 replyToPreview
  attachments?: ChannelAttachmentRef[];
  external?: ChannelMessageExternal; // 不变（provider 层）
}
```

- 校验器 `isChannelMessage` 只做「可选字段存在时类型正确」，未知字段继续容忍——老版本读新行不炸，NDJSON 不需要迁移。
- `replyTo` 与 `external.thread` 不是一个概念：前者是本地回复关系，后者是 provider 的 thread；桥接时再由 adapter 映射。
- 读模型返回的 `TimelineEntry` 可附 `replyToPreview: { id, authorLabel, excerpt }`，避免 client N+1 查引用目标。

### 4.5 Client：窗口 + 流式渲染 + 滚动

- **状态**：`conversation.window = { entries, olderCursor, newerCursor, hasOlder, hasNewer }` + `drafts: Map<draftId, Draft>`；所有 live 帧与分页合并写成纯函数（`applyLiveFrame` / `mergeOlderPage` / `settleDraft`），单测覆盖，组件只消费。
- **幂等**：committed 帧与 `send()` 返回、分页结果都按 message id upsert，天然去重（乐观回显不重复）。
- **Markdown**：bot/bridged 消息用 `<MarkdownText text={body} labels={memoizedLabels} />`；草稿用 `streaming` 渲染并在尾部加 typing 指示；human 文本保留 `white-space: pre-wrap`。`labels` 按 locale revision memoize（`MarkdownText` 的硬要求）。
- **滚动**：
  - 顶部 `IntersectionObserver` 哨兵 → `loadOlder()`；prepend 后按 `scrollHeight` 差值恢复 `scrollTop`（scroll anchoring）。
  - 底部哨兵 → `loadNewer()`（断档/新消息）。
  - 仅在「接近底部」时自动跟随新消息；否则显示「N 条新消息」pill，点击回到底部。
  - `around` 打开时把锚点消息滚到视口并短暂高亮。
- **发送**：乐观插入 pending 条目（灰显/时钟），收到 committed 帧后替换；composer 不再被整个 turn 阻塞。
- **不做虚拟化**：与原生 chat 一致，靠有界窗口 + 分页控制体积；等 Channel 规模需要时再评估（现在引入是过早优化，且仓库无虚拟化依赖）。

### 4.6 附件

- **CAS**：新增 `packages/core/src/attachments/`（deep module）：`put(stream) → { hash, size }`、`open(hash)`、`path(hash)`；布局 `$DSH_HOME/botharness/attachments/<hash[0:2]>/<hash>`；内容寻址、按引用计数或标记-清除做 GC。这是 ADR-0037 已写明的方向（「Attachment bytes live outside SQLite in a profile-scoped content-addressed file store」）。
- **上传**：`POST /api/botharness/attachments`（`requestBody: 'streaming'`，body 是原始字节，`name`/`mime` 走 query/header），返回 `ChannelAttachmentRef`；client 用 `fetch` + `FormData`/raw body，显示进度可用 `ReadableStream` 或简化为 spinner。
- **下载**：`GET /api/botharness/attachments/<hash>` 流式回包，带 `Content-Type` / `Content-Disposition` / `ETag`；Range 列为后续。
- **渲染**：图片走缩略图/原图（`<img>`，需在同一路由下），其他显示文件 chip（名称、大小、下载）；bot 通过 `channel_send` 的 attachments 参数发送留到该切片再加。
- **安全**：不信任 mime/文件名，服务端嗅探并强制 `Content-Disposition: attachment`（图片例外）；大小上限与配额列为开放问题。

### 4.7 与 Messaging 迁移（#46 / ADR-0037）的关系

- 现在实现的是「NDJSON 权威 + live hub」；ADR-0037 落地后权威切到 SQLite，`ChannelLiveHub` 的发布点不变（仍在 messaging command commit 后），`ChannelTimeline` 契约不变，改的只是实现。**不要**让 client 或 live 协议依赖 NDJSON。
- Source Revision 进来后，Timeline 需要增加 `revision` 语义（同一条消息的当前呈现）；cursor 编码 `(at, id)` 仍然够用，但 `TimelineEntry` 要预留 `revision?` / `editedAt?`，UI later 显示「已编辑」。
- ADR-0037 的「post-commit + outbox 恢复」给了 SSE 一个正式的重放来源：`Last-Event-ID` 补发应建立在持久层的序上，而非进程内 buffer。当前 NDJSON 下按「最后一条已提交消息 id」补差即可。

## 5. 建议的 tracer-bullet 切片

依赖图：`A → B → C`，`D` 依赖 A（渲染不依赖 C），`E`/`F` 依赖 A + C。

| 切片                                             | 端到端行为（Human 可验收）                                                            | 主要内容                                                                                                                                   | 关键回归                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **A. Live Channel 流（先修「不刷新」）**         | 用户停留在 DM/群聊，human 消息立即回显；bot 回复在 turn 结束前无需手动刷新即可出现    | `fetch.register` SSE 路由 + `ChannelLiveHub`；`channelSend` 只 await commit、turn 异步；client `EventSource` + 断档重查                    | Host：SSE 路由鉴权/形态、post-commit 广播；client：帧 reducer、重连补差      |
| **B. 草稿流式（本问题的核心）**                  | 用户看到 bot 的消息逐字出现，随后被权威消息替换；取消/失败时草稿消失                  | `ChannelDraftTracker`（assistant-stream + BlockAssembler + 容错 JSON 提取 + 节流）；draft/settled/abandoned 帧；client draft 渲染与 settle | 草稿不落盘/不进 Inbox；无 channel_send 无草稿；provider 一次性 args 退化正确 |
| **C. Cursor 分页 + lazy load / infinity scroll** | 打开频道围绕 last-read 载入 pre/post；上滚加载更早、下滚加载更新；跳转到引用/搜索结果 | Timeline read model + `older/newer/around`；client 窗口 + 双向哨兵 + scroll anchoring + 新消息 pill + last-read 本地存储                   | 分页边界、重复/空洞、prepend 不跳屏、`hasMore` 语义                          |
| **D. Markdown 渲染**                             | bot 消息与草稿按 Markdown 渲染（代码块/列表/表格），human 保持纯文本换行              | `format` 字段；`MarkdownText` + memoized labels；草稿 `streaming`；样式对齐 `dsh-ui`                                                       | labels 引用稳定；HTML/不安全链接仍被禁用；连续消息分组不回归                 |
| **E. Reply-to**                                  | 可回复某条消息；bubble 显示引用块；点击跳到原消息并高亮                               | `replyTo` + 读模型 `replyToPreview`；composer 回复态 + Esc；`around` 跳转                                                                  | 跨 Channel 引用被拒；删除/不可见目标的降级显示                               |
| **F. 附件**                                      | 可上传文件/图片随消息发送；bot 可发送附件；图片内联、文件可下载                       | CAS 模块 + 上传/下载 Fetch 路由；`attachments` 字段与渲染；`channel_send` 支持附件                                                         | 哈希去重、大小上限、mime 嗅探、下载头安全                                    |

顺序建议 A → B → D → C → E → F：A 是一切的前置且能立刻修掉「不刷新」；B 是用户点名的流式；D 很小且让 B 立刻接近原生观感；C 是聊天界面的骨架改造，独立且最大，放其后；E/F 是消息形态扩展。每个切片都必须带「真实 DM 里可操作可判断」的验收路径 + 单测（Host 与 client 各半）。

## 6. 风险与运行时验证清单（实施前必须先 spike）

1. **SSE 端到端**：`fetch.register` 的精确路由 + 浏览器 `EventSource` + cookie 鉴权 + `Last-Event-ID` 在 DSH dev loop（`dsh web --profile web-dev`）里真的能跑通；路径拼接（`/botharness/stream` vs `/api/botharness/stream`）按运行实例确认。
2. **tool-call delta 真的会来**：用真实 provider 跑一次 DM turn，记录 `agent/assistant-stream` 帧；确认 `tool-call-delta`（带 `name:'channel_send'` 与 `argumentsDelta`）的粒度与顺序；确认 `BlockAssembler.blocks()` 在流中返回开块且 `arguments` 是部分 JSON。
3. **`{ global: true }` 覆盖**：BotHarness adapter 通过 `ctx.agents.create/resume` 创建的 Agent 上，全局监听能否拿到；确认没有 scope 过滤。
4. **`MarkdownText` 在 BotHarness client bundle 可用**：公开导出、peer 依赖、`labels` 形状与 locale 来源；`streaming` 增量行为符合预期。
5. **`channel_send` 隐式 channel_id**：草稿归属用 run 的 inbound channel；显式 `channel_id` 与 body 乱序/后到的重归属逻辑要有测试。
6. **文件规模**：`readMessages` 全量读 + `before` 线性查找在多大 Channel 上开始痛；tail-read 优化是否需要提前。

## 7. 建议的 ADR 与开放问题

建议随实现补 ADR（不要留在聊天里）：

- **ADR：Channel live delivery 是 post-commit notification + 瞬态呈现草稿**。明确草稿不落盘、不是 Source Event、不进 Inbox/Outbox/TTS/Live2D；settle 由 commit 驱动；断线不恢复半截文本。这是 ADR-0049 的扩展与例外边界。
- **ADR：Channel timeline 以 opaque cursor 分页暴露 read model**。`older/newer/around` + `hasOlder/hasNewer` 是 client 唯一依赖，NDJSON/SQLite 实现可替换。
- **ADR：附件是 profile-scoped CAS**（如果 F 落地时还没有正式 ADR 覆盖）。

开放问题：

1. human 消息要不要也支持 Markdown 输入/渲染（以及 composer 是否需要预览、粘贴图片）？
2. last-read / 未读锚点存 client（localStorage）还是 profile-scoped 存储？与 #126 Human Inbox 的 Channel Attention 如何共用事实？
3. 草稿 baseline（重连后恢复进行中文本）是否值得做？做到什么程度（单 Channel 最新草稿 vs 全量 accumulator）？
4. 群聊里多个 bot 同时发言时的草稿排序/并发上限（issue #124 的 facepile activity 与 live 帧如何共用 revision）。
5. 附件配额、保留策略与 Content Purge（ADR-0037）的交互。

## 8. 来源

| 来源                                                                                                                         | 内容                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/research/2026-09-21-dsh-session-streaming-and-client-facts.md`                                                         | `SessionEvent` vs `agent/assistant-stream`、`BlockAssembler`、`MarkdownText`、`fetch.register`、分页/虚拟化结论（含 pinned 0.1.5-rc.2 的包内 `.d.ts` 引用） |
| `packages/core/src/channels/{channel,store}.ts`、`bridge/{methods,rpc}.ts`、`runtime/{bot-runtime,dsh-bot-agent-adapter}.ts` | 当前消息模型、NDJSON 存储、append/read 路径、`channel_send` tool、Source Event 切片                                                                         |
| `packages/client/src/client/{bot-main,actions,bridge,store,index}.ts(x)`                                                     | 当前渲染、发送阻塞、重载时机、无分页消费、slot 注册                                                                                                         |
| `docs/adr/0036-…`、`0037-…`、`0049-…`；`docs/architecture/botharness-architecture.md:163-202`                                | 说话入口、Messaging 权威与 commit-then-notify、projection+revision、TTS 不消费草稿                                                                          |
| issue #124 / #46 / #10 / #126                                                                                                | 消息呈现 tracer、Messaging deep module、聊天外壳、Human Inbox                                                                                               |
| `docs/client-bridge.md:20-21,73,82-84`                                                                                       | `/api` 归属与「私有 Fetch 路由上做 SSE/长轮询」的既定方向                                                                                                   |
