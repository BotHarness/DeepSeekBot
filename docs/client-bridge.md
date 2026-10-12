# 客户端桥（Client Bridge）规格

| 项       | 内容                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本     | v0.7（Roster 多选经单次 `rosterBatch` 提交，#215）                                                                                                                                 |
| 日期     | 2026-09-23                                                                                                                                                                         |
| 状态     | Implemented（`list/get/create/update/pause/resume` + 五个 channel 方法 + `sessions` + 十个 roster 方法）                                                                           |
| 适用范围 | M3（Roster、Chat 壳与本地 Channel 历史）：`@botharness/ui` ↔ `@botharness/core` 的读模型契约                                                                                       |
| 决策记录 | ADR-0023（客户端桥是读模型 RPC，不是 Cordis 注入）及其 2026-09-19 更新、ADR-0037（Channel 与 Bot Inbox 的同一 SQLite 权威）、ADR-0034（持久化地图与主客分界，#66 落地陈列迁 Host） |
| 设计权威 | `docs/architecture/botharness-architecture.md`；取舍与理由见相关 ADR                                                                                                               |

## 1. 为什么需要桥

Web Client 是**独立的浏览器 Cordis 应用**，与 Host 分开组装、分开加载；分层是「Host 状态 → Remote 传输 → Client model → UI adapter → Slots」。因此 `ctx.provide('botharness', core)` 只对 Host 内插件可见，浏览器半侧**不能** `inject` 该服务。

core 把 PersonaBot 的读模型显式定义为一组 RPC 方法；浏览器只依赖这份 wire 契约，不依赖任何 Host 对象。方法名与信封已随 M3.1 实现冻结。

## 2. 传输与信封

- 通道：通用 Connection RPC（共享 `/api`）。`/api` 路由与其**唯一 interceptor 槽位**归 `@deepseek-ai/dsh-api-gateway`；插件端点必须经 gateway 认领，**不得** `connection.rpc.intercept('/api', …)`（见 #50）。
- 客户端调用：`ctx.connection.rpc.call('/api', 'botharness/<method>', { args: { …命名参数 } }, signal)`。
- Host 注册：`BotharnessBridgeService extends TypertRemoteService`（Cordis 服务键 `botharnessBridge`，wire namespace `botharness`），随 `ctx.provide`/Service 生命周期注册；gateway 扫描带 `typertRemote` 绑定的服务与 remote-method descriptor（SRC markers，无构建期 codegen）后认领 `botharness/*`。
  - 方法参数按**命名 wire 字段**传递（与下表入参同名）；缺省可省（SRC codec 允许 missing），未知字段会被 gateway 拒绝为 `gateway/arguments-invalid`。
  - 构建链（rolldown/oxc）不 emit 标准装饰器语法，故 descriptor 由 `markRemoteMethods` 直接写入（键 `@deepseek-ai/dsh-typert-protocol/remote-methods`，version 1），格式由 `packages/core/test/bridge-rpc.test.ts` 锁住。
- 失败映射：方法抛 `RemoteError(code, message, {})`；gateway 原样编码为响应信封的 error 分支，客户端仍按 `{ ok: false, error }` 处理。
- 响应信封：

  ```ts
  type BridgeResult<T> =
    | { ok: true; value: T; cursor?: string }
    | { ok: false; error: { code: string; message: string } };
  ```

- `code` 用稳定枚举（如 `invalid-slug`、`duplicate`、`not-found`、`invalid-input`、`storage-unavailable`），`message` 只供展示；服务端错误不得带堆栈或凭据。`storage-unavailable` 表示该 profile 没有 `storageDomain` 后端：roster 的读与写都以该码失败（`rosterGet` 不假装空陈列），客户端在首次加载即渲染只读态，后端可用后重载即恢复。

## 3. 方法面

命名一律 `botharness/<method>`，unary、无副作用泄漏；写方法与读方法同一信封。

| 方法                         | 入参                                                                                             | 出参                                                                                              | 说明                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `botharness/list`            | `{ query?, since? }`                                                                             | `{ bots: PersonaBotSummary[]; cursor }`                                                           | roster 名册；`since` 增量                                                                                                                                                                                                                                                                                          |
| `botharness/get`             | `{ slug }`                                                                                       | `{ bot: PersonaBotDetail }`                                                                       | 详情（含记忆入口、workspaces）                                                                                                                                                                                                                                                                                     |
| `botharness/create`          | `{ displayName, roles?, persona?, description?, model?, preset?, workspaces?, avatar? }`         | `{ bot: PersonaBotDetail }`                                                                       | Host 生成内部 ID；最小 UI 发名称及可选岗位/简介；persona 写入 `SOUL.md`，并写入 `MEMORY.md` 模板（ADR-0134）                                                                                                                                                                                                       |
| `botharness/update`          | `{ slug, patch: { displayName?, roles?, description?, model?, preset?, workspaces?, avatar? } }` | `{ bot: PersonaBotDetail }`                                                                       | `slug` 是内部 ID 的当前 wire 键；不写 persona（人属）；空值清空可选字段                                                                                                                                                                                                                                            |
| `botharness/pause`           | `{ slug }`                                                                                       | `{ bot: PersonaBotDetail }`                                                                       | 暂停后续委派；状态仍在读模型中（`paused: true`）                                                                                                                                                                                                                                                                   |
| `botharness/resume`          | `{ slug }`                                                                                       | `{ bot: PersonaBotDetail }`                                                                       | 恢复委派；读模型清除 `paused`                                                                                                                                                                                                                                                                                      |
| `botharness/botAvatarSet`    | `{ channelId, avatar }`                                                                          | `{ bot: PersonaBotDetail }`                                                                       | 仅 PersonaBot DM；`avatar` 是有界 PNG/JPEG/WebP data URL（512×512、解码 ≤128 KiB）或 `null` 清除；读模型返回受认证读取 URL                                                                                                                                                                                         |
| `botharness/profileActivity` | `{ channelId, before?, weeks? }`                                                                 | `{ slug, weeks, since, before?, createdDay?, today, events, memoryCommits, tokens, tokenTotals }` | PersonaBot Profile 卡片读模型：默认近 26 周；传 `before`（YYYY-MM-DD，不含当天）和 `weeks`（1–104）时返回这之前的那一段，供热力图向左滚动时加载更早的周。Host 本地日界的事件（按 reason）、Memory commit 日计数，以及四桶 token 日汇总（来自 `usage_daily`）；`createdDay` 是 Bot 的创建日，`today` 是 Host 当前日 |
| `botharness/channels`        | `{}`                                                                                             | `{ channels: ChannelListItem[] }`                                                                 | M3 本地 Channel 列表；附可选的最新消息投影；`updatedAt` 新→旧                                                                                                                                                                                                                                                      |
| `botharness/channelDm`       | `{ slug, displayName? }`                                                                         | `{ channel }`                                                                                     | 打开 BOT 的 DM（幂等）；M3 仅本地                                                                                                                                                                                                                                                                                  |
| `botharness/channelCreate`   | `{ name, members }`                                                                              | `{ channel }`                                                                                     | 新建群聊 Channel；M3 仅本地                                                                                                                                                                                                                                                                                        |
| `botharness/channelRename`   | `{ channelId, name }`                                                                            | `{ channel, bot? }`                                                                               | 重命名 group Channel；DM 同步 PersonaBot displayName，但保留 Channel ID 与内部 PersonaBot ID                                                                                                                                                                                                                       |
| `botharness/channelMessages` | `{ channelId, before?, limit? }`                                                                 | `{ messages, revision }`                                                                          | 历史快照与该 Channel 的提交修订号；`before` 用于分页                                                                                                                                                                                                                                                               |
| `botharness/channelTimeline` | `{ channelId, direction?, cursor?, around?, limit?, olderLimit?, newerLimit? }`                  | `{ page: { entries, olderCursor, newerCursor, hasOlder, hasNewer }, revision }`                   | #143 当前读路径；Host 解释不透明游标，按持久提交顺序返回 latest / older / newer / around 连续窗口                                                                                                                                                                                                                  |
| `botharness/channelSend`     | `{ channelId, body, replyTo?, mentions?: {botSlug,label,start,end}[] }`                          | `{ message }`                                                                                     | 可选同 Channel 引用；Group mention 必须来自已选 token，Host 校验成员及活跃身份后分别投递                                                                                                                                                                                                                           |
| `botharness/assignments`     | `{ slug }`                                                                                       | `{ assignments }`                                                                                 | PersonaBot 的 Assignment Directory 摘要                                                                                                                                                                                                                                                                            |
| `botharness/assignment`      | `{ slug, sessionId }`                                                                            | `{ assignment }`                                                                                  | 一项 Assignment 的目的、状态、报告与 Session 关联                                                                                                                                                                                                                                                                  |
| `botharness/sessions`        | `{ slug }`                                                                                       | `{ sessions: SessionSummary[] }`                                                                  | BOT 的会话列表：cwd 落在其 workspace 内；`updatedAt` 新→旧                                                                                                                                                                                                                                                         |
| `botharness/rosterGet`       | `{}`                                                                                             | `{ pins, hidden, sectionOrder, topOrder?, sections }`                                             | 陈列快照；`hidden` 只省略 navigation，不改 placement；无 storage 时报 `storage-unavailable`                                                                                                                                                                                                                        |
| `botharness/sectionCreate`   | `{ name }`                                                                                       | `{ section }`                                                                                     | 新建 section；id 由 Host 生成（uuid）并入 order 末尾                                                                                                                                                                                                                                                               |
| `botharness/sectionRename`   | `{ sectionId, name }`                                                                            | `{ section }`                                                                                     | 重命名；未知 id → `not-found`                                                                                                                                                                                                                                                                                      |
| `botharness/sectionRemove`   | `{ sectionId }`                                                                                  | `{ removed }`                                                                                     | 删除 section；成员回落未分组；幂等                                                                                                                                                                                                                                                                                 |
| `botharness/channelAssign`   | `{ channelId, sectionId?, index? }`                                                              | `{}`                                                                                              | 单一归属：先移除旧归属再入新 section；`sectionId` 省略/null = 未分组；`index` 省略追加；幂等                                                                                                                                                                                                                       |
| `botharness/sectionReorder`  | `{ order }`                                                                                      | `{ sectionOrder }`                                                                                | section 顺序；未知 id 丢弃、省略的 id 保持原序在后                                                                                                                                                                                                                                                                 |
| `botharness/topReorder`      | `{ order }`                                                                                      | `{ topOrder }`                                                                                    | section block 与未分组 Channel 的绝对混排；未知 id 丢弃、单一归属保持                                                                                                                                                                                                                                              |
| `botharness/pinsSet`         | `{ pins }`                                                                                       | `{ pins }`                                                                                        | 置顶 Channel ID 列表；去重                                                                                                                                                                                                                                                                                         |
| `botharness/hiddenSet`       | `{ hidden }`                                                                                     | `{ hidden }`                                                                                      | 隐藏 Channel ID 列表；去重；不改 pin、section 或 topOrder                                                                                                                                                                                                                                                          |
| `botharness/rosterBatch`     | `{ action, channelIds, sectionId? }`                                                             | `RosterSnapshot`                                                                                  | 一次处理 1–100 个不同 Channel；pin/unpin/hide/move；move 可指定分组或未分组；一次完成通知                                                                                                                                                                                                                          |

`ChannelRecord` 含 `id / type ('dm' | 'group') / name / members (PersonaBot IDs) / botSlug? (dm；当前 wire 键) / createdAt / updatedAt`；`ChannelListItem` 在它之上附加可选 `latestMessage`，由现有消息权威读取并投影给折叠 rail，不写回 `channel.json`；`ChannelMessage` 含 `id / at / author ({ kind: 'human' } | { kind: 'bot', slug } | { kind: 'bridged', source }) / body / external? ({ id, thread? })`。当前 Channel 的 Source Event、placement 与 Inbox Admission 已由 `botharness.db` 统一提交；旧 `channel.json`、`messages.ndjson` 与 `read-position.json` 只在首次升级时导入，之后不再作为读写权威。Group Channel 的 Human 可选中多个已入群的 PersonaBot，Host 验证身份与成员关系后独立唤醒，回复仍经显式 `channel_send` 回到群里。`before` 是消息 id 游标：返回比该消息更旧的一页。

`ChannelMessage.format?: 'markdown' | 'text'` 是可选的内容表示提示；旧记录无需迁移。Client 默认把 Human 消息按原样文本和换行呈现，把 Bot / bridged 消息交给 DSH 公开的 `MarkdownText`；显式 `format` 可覆盖默认值。原生渲染器不允许危险协议、相对链接或原始 HTML 生效，也不传入本地文件扩展词汇。

#143 起，Client 读取历史首选 `channelTimeline`，旧 `channelMessages` 只保留兼容。当前 Host 从 SQLite Channel placement 读取并切片；Client 不解释游标，也不将整段历史无限累计到内存。游标与消息 revision 各司其职：前者定位历史页，后者是 SSE 重连水位。详见 ADR-0061。
#145 的 `replyTo` 是可选的同 Channel 已提交消息 ID；Human 的 `channelSend` 与 Bot 的 `channel_send.reply_to` 共用 ChannelStore 校验，目标不存在或属于其他 Channel 时返回稳定的 `invalid-input`，不写消息。持久化只保存 `replyTo`；时间线/历史读取用同次扫描的消息索引投影 `replyToPreview: { author, body } | null`，正文摘要最多 140 个 Unicode code points，不逐条额外查询。目标后来不可见时显示不可点击的「原消息不可用」。Client 的回复模式可取消或按 Esc 退出，成功发送后清除；点击引用通过既有 `around` 窗口定位并高亮目标。

`SessionSummary` 含 `id / title / cwd / updatedAt`；标题取会话日志里第一条 `user/message` 的文本（无则空串，客户端回退展示），`updatedAt` 取最后一条事件时间（无事件回退 `createdAt`）。`sessions` 只读 DSH Host 当前在册的会话（`ctx.sessions.list()`），按 cwd 是否位于 BOT 的任一 workspace 内过滤。这是已实现 M3 bridge 的临时兼容启发式，只用于描述当前 wire 行为；新领域逻辑不得把 cwd 当 ownership。#80 会以 durable explicit Session ownership 和 Orchestrator / Assignment role projection 替换它（ADR-0035/0045）。

`PersonaBotSummary` 含 `slug（内部 PersonaBot ID 的当前 wire 键）/ displayName / roles[] / description? / avatar? / paused? / aggregateState / workspaces / createdAt`；`PersonaBotDetail` 追加 `model? / preset? / memoryDir? / sessions`。`aggregateState` 为五态聚合，六态是客户端展示派生。委派（delegate）与记忆编辑不在已实现面：前者依赖工位会话，后者复用 `memory_*` 工具语义后另行补方法。

`RosterSection` 含 `id / name / channelIds`（数组序 = 显示顺序）；`RosterSnapshot` 含 `pins / hidden / sectionOrder / topOrder? / sections`，其中 `pins` 与 `hidden` 的 canonical identifier 都是 Channel ID。陈列的权威是 Host storage 域 `botharness_roster`（json 后端、`version 1`、`layout: single`；global `{ pins, hidden?, sectionOrder, topOrder? }` + `sections` 表，ADR-0034），客户端不碰 Host 文件或 `ctx.storage`；各方法每次写入返回即已落盘；单项写入后客户端重拉 `rosterGet`，多选使用 `rosterBatch` 返回的最终快照一次更新 UI（不做逐项乐观状态）。当前 storage-domain 不支持跨 section 记录的事务，批量移组会按受影响 section 各写一次，但只在整个 Host 命令完成后发出 roster 完成通知；失败时客户端重查快照，旧 `roster.json` 只作一次性迁移源。隐藏只改变 roster navigation；恢复沿用未被改写的 pin/section/order。排序偏好不在本桥（#68 `ui-bot-mode` settings），折叠状态留浏览器本地。

置顶格按 `pins` 保存手动顺序，排序偏好使用 `ui-bot-mode.sortModes.pinned`；缺省时继承全局 `sortMode`。从置顶格拖动至另一置顶卡片时，仅调用一次 `pinsSet` 重排完整 Channel ID 列表，不改变置顶集合；Host 写入成功后再切换该 scope 为手动排序，并重读权威 roster。

## 4. 刷新与变更模型

- **分页与阅读位置（#143）**：打开 Channel 取最新 50 条；靠近顶部加载更早页，按原有消息的屏幕位置校准视口（同 sender 气泡组跨页重排时也不跳动）。围绕消息 ID 可打开前后窗口；离开末尾时保留连续的历史窗口，只提示有新消息，不把 SSE 尾部跨缺口拼接进去；加载失败保留原窗口并可重试。
- **Channel 消息（#141）**：`channelTimeline` 页返回 durable `revision`；已选 Channel 建立一个经 DSH 认证的 `GET /api/botharness/stream?channelId=…&after=revision` SSE 流。Host 仅在消息持久提交后发带递增 revision 的 `channel/message`，重连从权威日志回放、缺口则从 Host 修复连续窗口；Human 本地发送立即回显。Assignment 输出和普通 assistant final 不进入 Channel。
- **Bot 草稿流（#144）**：Host 全局观察 Orchestrator `agent/assistant-stream`，以 DSH `BlockAssembler` 从显式 `channel_send` 参数提取正文。`channel/draft`、`channel/draft-settled`、`channel/draft-abandoned` 带 attempt ID 与进程内单调草稿 revision；草稿 revision 不等于 durable Channel revision，也不是 SSE replay ID。每次连接先发完整草稿 baseline；Client 在断档时丢弃草稿并重读 committed，按 animation frame 合并预览渲染。草稿不落盘、不进入 Inbox；只有提交后的 `channel/message` 可供不可逆消费者使用。
- **其他读模型**：create/update/pause/resume 后仍主动刷新；现有名册低频轮询与六态 Activity 实时投影不由 Channel SSE 替代。Host 进程内 `states.on(...)` 不能跨浏览器直接使用，上游 Remote 事件白名单也不可由第三方扩展。
- **路由边界**：SSE 使用 Connection Fetch 注册完整 `/api/botharness/stream` 路径，而不是占用 API gateway 的 `/api` RPC interceptor；普通读写命令继续使用 Typert bridge。详见 ADR-0054。
- 客户端仍以「读模型可能过期」为前提渲染：加载态、错误态、空态都是一等 UI。

## 5. 为什么不走 Cordis inject / 为什么最终走 Typert SRC

| 路径                     | 结论                                                                                                                        |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `inject(['botharness'])` | 不成立：浏览器与 Host 是两个 Cordis 应用，跨进程没有服务注入                                                                |
| Typert 严格 codegen      | 暂缓：需构建期生成 + 第一方 assembly；仓库外可复现性未验证                                                                  |
| Typert SRC markers       | 已采用（#50）：`TypertRemoteService` + `typertRemote` 绑定即可被 gateway 认领，无需 codegen；`/api` 单槽位仍归 gateway 所有 |
| 直接 `states.on` 推送    | 不成立：转发事件白名单是第一方静态文件，第三方不可扩展                                                                      |
| Channel SSE              | 已实现（#141）：单向投递已提交消息和进程内 `channel_send` 草稿；快照与命令仍走 Typert RPC，其他状态不借此流广播             |

## 6. 客户端包与 bundle 约束

- **独立包** `@botharness/ui`（DSH 默认是「同一包两半侧」，本仓库按 ADR-0023 显式偏离）：package.json 声明 `dsh.client = { platform: 'web', inject: [] }` 与 `exports['./client']`，并作为独立 Loader entry 挂载。
- **产物格式**：lazy-CJS closure factory，入口 `lib/client.js`，自注册 `window.__ModuleLoader__.load({ id: '@botharness/ui', factory: (require) => { … } })`，带 sourcemap。
- **外置基线**：只外置 shell 注入的模块表（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-store`、`@deepseek-ai/dsh-client-ui-slots`、`@deepseek-ai/dsh-client-ui-primitives`、`@deepseek-ai/dsh-client-ui-dockkit`）；其余依赖（含 blobatar）全部内联。
- **纯净门禁**：跨插件只允许 `import type`，不得值导入；跨包协作走 Cordis 服务或 slot。
- **构建**：共享 preset（`clientBundle()`）未发布，等价构建已在根 `tsdown.config.ts`（`clientBundleOptions`）实现：banner/footer 生成 closure factory，`pnpm build` 产出 `lib/client.js` + `lib/client.js.map`。契约由 `packages/client/test/client-bundle.test.ts` 覆盖（自注册、只外置 shell 基线、插件注册）。剩余风险转移到 M3.5：把该 Loader entry 装进真实 profile 并加载。

## 7. 本地开发环路（DSH 0.2.0 RC1）

日常 UI 迭代可使用隔离 Web Profile，或在原生 Windows checkout 的官方 Desktop 上使用本地链接 Client；官方 Desktop 的安装、文件夹选择和重启行为仍需原生验收。每个工作树使用独立的 DSH_HOME 与端口，启动器固定调用该工作树安装的 DSH CLI，并在版本不符时失败，避免误用系统级旧版 CLI。

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
node scripts/dev-instance.mjs --home /tmp/bh-020-web --port 31967 --json
corepack pnpm dev:client
```

- 启动器从 Web 模板创建 Profile，将 Core、Client、Browser、Computer 和 DeepSeekBot 本地链接；`dsh.profile.bundles` 只包含 umbrella Bundle `deepseekbot`（Browser 与 Computer 由同一 Bundle Patch 激活，不再是独立 Bundle）。它检查认证 API Gateway，JSON 摘要包含进程 PID、健康状态和本地登录 URL。登录 URL 仅用于本机浏览器，不写入 Issue 或日志。
- 在本机打开登录 URL，运行 `pnpm dev:client` 后，Client bundle 改动会自动构建。Web Profile 使用本机开发监听器在 `rebuilt` 事件后整页刷新，需重新进入 Bot mode；官方 Desktop 则由 DSH Client HMR 替换 `@botharness/ui` Fiber，BotHarness 仅暂存当前 Bot/Channel 选择并在新 Fiber 就绪后恢复同一 DM。此视图状态不持久化；一般 UI 改动无需重启 Host。
- Host 改动先 `corepack pnpm build`，对启动摘要中的 PID 执行 `kill <pid>`，再用相同 `--home` 与 `--port` 重启启动器。Host 热替换当前关闭（0.1.7 RC2 实测；0.2.0 RC1 未复验，仍按重启处理）；重启会中断运行中的任务。此机样本：Client 保存到改动可见约 1.2 秒（构建约 0.1 秒），Host 停止后到健康探测约 1.9 秒；这些不是跨机器性能保证。
- 机器级测试密钥由启动器按进程环境、`~/.config/botharness/dev.env`、Keychain 顺序读取；现有 Profile 凭据也可被 DSH 使用。运行 `node scripts/dev-secret.mjs check` 只显示来源。若要让后续隔离 Profile 共用已有密钥，可运行 `node scripts/dev-secret.mjs adopt-profile --home <已有 DSH_HOME>`；此操作只写受保护的本机密钥文件。模型可用性仍以真实 DM 回复为准。
- 自动回归：`node scripts/e2e-personabot-create.mjs` 创建自己的隔离 Profile，经认证 API 建立原生 Workspace、PersonaBot、DM 与 Git Memory，重启后核对同一身份和 Git HEAD，不发模型请求。

### Qualified optional IM provider

For real packaged-product qualification, use `--product-artifacts` instead of
`--im-provider`; see [Packaging and qualification](product-im-installation.md).
This selects a separate official CLI installation so DSH's installation-first
resolver cannot substitute workspace-linked Core/Client for the tarballs.

工作群 IM tracer 可在隔离 Profile 中显式加入已验证的临时 dsh-im fork：

```bash
node scripts/dev-instance.mjs --home /tmp/bh-im-qa --port 31968 --im-provider --json
```

仅对已停止的隔离 Profile 执行；重启同一 Profile 时仍传入 `--im-provider`，以重复校验。启动器使用 Git 完整提交 `dc9af0181e451b554dd3e3ceeb594d18f8b21df6` 与 DSH `0.2.0-rc.1`，校验 Bundle、入口及运行时代码 digest 后才启动 Host；不依赖另一份 provider 本地源码。安装摘要明确标注 `upstreamReleased: false`。此完整 fork 保留附件、回显与独立回复身份契约；群／话题上下文读取绑定当前独占 Consumer 生命周期，释放或替换后拒绝返回正在读取的结果；上游 PR 是否合并不阻挡此固定提交使用（[#789](https://github.com/BotHarness/BotHarness/issues/789)）。默认启动不安装它，原 npm `4.32.0` 仍不满足账号校验和条件发送契约。此入口不会发布包，也不是生产启用许可（[ADR-0104](adr/0104-isolated-im-profiles-pin-a-qualified-temporary-provider-fork.md)）。

在 dsh-im 原设置中配置测试应用，并保存、测试仅含测试者与 Bot 的目标群；凭据交由 DSH credentials service，不复制到 BotHarness。打开 PersonaBot Profile → IM connection，选择已认证账号与已测试目标，显式授权后发送一条唯一测试文本。预期 Recent sends 显示 Platform accepted，并在目标群核对同一文本；这不代表送达或已读。停止本次启动摘要中的确切 PID，再以相同参数启动：绑定与发送历史应保留，不自动重发。

一个测试应用只保留一个连接 owner，先停止之前使用该应用的测试 Host。#12 的入站必须启用下述 Bot Inbox 群收件，不启用 dsh-im standalone Session 作为替代。若需撤回此可选安装，先停止该 Profile 的 Host，在它的 `package.json` 中移除 `@xmanrui/dsh-im` dependency 与 Bundle，然后不带此选项启动；不删除 Profile 数据，已发送消息仍留在平台。

此 Provider 的入站仍以 Lark `text` 消息为触发；#657 为回复一个文件消息的文本 @ 增加准确父文件元信息、按需下载与原话题新文件回复，见[文件指南](file-open.zh.md#在原话题处理-lark-zip)。客户端使用代码样式、富文本或附件时可能生成 `post` 或其他类型，当前不会收件；验收时使用普通文本并从成员候选选择真实 @。格式化正文的规范化由后续 Provider 切片验证。

开启群文字 @ 收件后，在已授权群的既有话题里 @ 绑定身份，要求只回复一条唯一测试文本。预期 Bot Inbox 显示平台、群、发送人与接收身份；点击来源可读取完整保留正文；Bot 显式调用 `bridge_reply` 后，Recent sends 显示 Platform accepted，需在 Lark 核对原话题中的同一文本。普通无 @ 消息不进入 Inbox；首次回复不自动跟进话题；本地 Human DM 不镜像外部对话。关闭群收件或撤销绑定后旧来源仍可查看，但不能继续外部回复。此切片不自动将外部来源写入 Memory，也不提供远端历史读取。重启保持绑定和来源，不自动重发已接受或未知结果的回复（#12，ADR-0106）。

### Windows Desktop 检查点

在原生 Windows checkout 执行 `corepack pnpm install --frozen-lockfile` 和 `corepack pnpm build`，再从官方 Desktop 的插件页选择本地 `packages/deepseekbot`，启用插件并重启应用及 Host。`pnpm-workspace.yaml` 只放行 Desktop 安装实际需要执行的 native postinstall。用独立 `DSH_HOME` 保持 profile 与日常使用隔离；本机 AX 密钥只通过启动进程的 `DEEPSEEK_API_KEY` 环境变量注入，不写入仓库或 issue。

官方 0.1.7 RC2 的开发构建提供「重新加载页面」和「重启应用及 Host」（0.2.0 RC1 的 Desktop 行为待原生 Windows 复验）；安装版可能没有前一项。两者都不构建源码；Host 修改须先构建，再重启应用及 Host。[官方 Desktop 开发说明](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-rc.2/apps/desktop/README.md#develop)。

0.1.7 RC2 实测：Client Modules 将结尾 `/client` 当作导出子路径剥离，因此包名 `@botharness/client` 在插件页会显示 `prefetch("@botharness/client") — not a graph entry`；当前包名为 `@botharness/ui`（[ADR-0066](adr/0066-rc2-client-bundle-identity.md)）。在本机链接此包并运行 `pnpm dev:client` 时，Desktop 可收到 `rebuilt` 事件并在当前 DM 自动显示新文案，同时恢复所选 Bot/Channel。不要对运行过 Client HMR 的安装版 Desktop 做整页刷新：实测新文档的 boot 注入仍指向旧 Bundle revision（旧 URL 404，当前 graph URL 200），会报 `@botharness/ui: import failed`。这一故障发生在插件代码导入之前，不能由插件内的重试修复。若发生，先停止 watcher，显式 `pnpm build`，然后重启应用及 Host；保留已安装插件和 Profile，不点「禁用第三方插件」。崩溃报告位于 Windows `%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-*-web-boot.log`。以上 Desktop 结论均为 0.1.7 RC2 实测，0.2.0 RC1 未复验。

Windows 与 WSL 的 `~/.config/botharness/dev.env` 分属不同的用户目录。若密钥已保存在 WSL、但从 Windows 启动隔离实例，可在 Windows 终端一次性运行 `node scripts/dev-secret.mjs adopt-env --from <WSL-dev.env-path>`（传入该文件的 UNC 路径）；它只读取 DeepSeek 项并在 Windows 用户目录中创建本机文件，不覆盖已有文件，也不打印密钥。随后用 `node scripts/dev-secret.mjs check` 核实来源，再重启隔离 DSH Host 并实测模型回复。反向迁移也可使用同一命令和相应的源路径。

## 8. 未决

- 桥方法已实现（`packages/core/src/bridge/`），包括 PersonaBot 六个、Channel 相关方法、Assignment 两个、`sessions` 一个，以及 `rosterGet/sectionCreate/sectionRename/sectionRemove/channelAssign/sectionReorder/topReorder/pinsSet/hiddenSet/rosterBatch` 十个 roster 方法。前六个 PersonaBot 方法只落 `bot.json`/`SOUL.md`，Channel 方法经 Messaging module 读写 `botharness.db` 的 Source Event、placement 与已读位置（ADR-0037）；其中 `channelReadPosition` / `channelMarkRead` 持久化单调的已读锚点；DM 重命名同时更新 PersonaBot Registry 的显示名。roster 方法经可选 `storageDomain` 落 `botharness_roster`（无后端时读写都回 `storage-unavailable`，客户端首屏只读）。
- 委派与取消的方法形状（工位会话就绪后）。
- 记忆编辑是否走同一桥，还是继续只由 `memory_*` 工具在会话内负责。
- 六态 Activity 的独立实时性与未来 Channel SSE 的慢消费者背压策略（#141 首个切片只覆盖选中 Channel 的已提交消息）。
- `@PersonaBot` 提及 token 的 appearance 与序列化（依赖 `@deepseek-ai/dsh-client-ui-input-trigger` 的 `ReferenceInsert` 限制）。

## 8. 新消息附件的真实文件

富文本输入中的换行使用真实 `<br>` 节点；末尾空行的占位节点仅用于保持光标与视觉位置，不计入正文或引用偏移。行内附件之后按 Shift+Enter，再输入文字或粘贴多行文本时，正文仍保留对应换行。

附件卡片的角标编号只出现在 Composer 中；已发送消息仅在正文的行内引用块中保留编号，附件预览卡片和消息气泡不再重复显示角标。

Composer 保留顶部附件预览，并在文件选择／粘贴的光标处插入行内引用；顶部附件的引用按钮可在另一位置再次插入。卡片右下角和行内引用展示相同的附件序号，按当前附件列表从 1 编号，移除附件后自动重排，重复引用沿用同一序号；序号只是展示投影，不写入附件身份。粘贴在捕获阶段收集浏览器提供的文件和图片（兼容 `clipboardData.files` 与 `items`），去重后沿用原上传路径；纯文本仍正常粘贴，不根据剪贴板文件路径读取本机文件。引用以正文中的 `[转义文件名](attachment:编码文件身份)` 保留，同名文件按 `fileId` 区分，上传中沿用 `file:<uploadId>`，不会新增持久附件权威。Client 只将当前草稿／消息实际持有的附件投影为不可拆分的引用块；未匹配的标记保持普通正文。删除引用不删除附件，移除附件则删除草稿中该文件的全部引用。发送后引用可定位消息的附件卡片；读取／打开仍经过原有 Channel／message 归属校验，标记本身不授权文件访问。

`messageAttachmentTarget({channelId,messageId,fileId})` 由 Messaging 校验当前消息归属并返回 `{target:{path,relativePath,kind:'file'}}`，供 Human Client 使用现有 DSH 原生能力。下载 GET `/api/botharness/attachment?channelId=...&messageId=...&fileId=...` 每次验证同样归属，并以 `no-store` 返回当前字节；单独路径、文件名或 hash 不能启动新附件。旧 hash GET 必须同时携带原 Channel／message 归属；唯一匹配时读取迁移后的当前文件，缺失归属或含糊匹配拒绝。未转换依赖仍使用校验后的 CAS。Host 启动在 generation 39 的 Messaging 绑定中预留身份、验证转换并激活，保留原消息 envelope。POST upload 的可选 `uploadId` 是 Composer item UUID，响应新 `{fileId,name,mime,size}`。上传重试回执不覆盖外部编辑。消息读取投影当前元数据，发送幂等比较稳定身份与名称。详见[文件指南](file-open.zh.md)。

### External-only Lark report QA (#639)

Use the same isolated `--im-provider` Profile with an existing bound identity and explicitly authorized QA group. Ask the owning Bot to list `bridge_targets`, post one unique report with `bridge_post` and a stable request ID, then inspect it with `bridge_outbox`. In PersonaBot Profile → Channel connectors and authorization → Recent sends, click that report for a native Modal with account, target, canonical content and honest outcome. Check the native receipt on Lark; it is not read status. The exact report must have no local Channel placement (the Human instruction that requested it may remain in DM).

Reply to that exact Lark report in its topic, @mentioning the bound Bot. Its eligible Human message enters Bot Inbox with the original report association, visible in source details. Ask the Bot to inspect the source and own report and use `bridge_reply` only in that original topic. A reply does not enable unmentioned following; ordinary group intake uses the group's existing policy. Reuse the same post request key if checking a possibly interrupted operation, and never automatically resend an unknown outcome. Historical sent reports remain readable after identity removal; new sends and replies still need current authorization. Own-echo contract tests do not prove platform echo delivery. No scheduler, Slack or private-DM qualification is part of this slice.

### 外部附近上下文

Bot 使用 `bridge_context` 的 `nearby` 时，默认读取来源前后各五分钟内的可见 Human 文字消息；一侧不足时，补齐最近的前 10／后 5 条（锚点自身不计入）。可使用 `before_count`／`after_count` 调整每侧 0–20 条。窗口密集时不会因为达到条数而截断：继续传回同一来源、范围和条数配置下的 `nextCursor`，直到没有续页；每页仍受返回文字预算限制。每个 Cursor 有效 30 分钟，重启或授权变化可使其失效。Lark 的 Chat 列表可能不包含话题回复，读取话题内容仍使用 `thread`；锚点本身保留在原 Inbox 来源中。只读取现有消息，不等待未来内容；权限、略过消息或历史已尽可使结果不足保底数量。读取的历史不会自动进入 Inbox（[ADR-0125](adr/0125-nearby-context-combines-time-coverage-and-count-minima.md)）。

### Window Companion 的未来消息消费（#1138–#1140）

终态流恢复（#1141）：暂时 HTTP 拒绝可能令浏览器 EventSource 进入 CLOSED，而不是继续原生自动重连。集合 owner 用一个 1–8 秒退避计时器替换关闭的流，并在 `GET ?subscribe=1&resume=<consumerId>` 携带最后确认的过程租约；Host 仍按同一认证路径、60 秒租约和最新选择重查。原生 `Last-Event-ID` 优先于 `resume`，避免新流后续自动重连误用旧查询参数。租约不持久化；取消最后一个选择和 Plugin dispose 清理计时器、恢复标识及连接。

共享 Activity 健康状态仅在连接状态变化时更新；取消钉选会释放旧的 stale 提示。只有成功加载的 Registry 名单确认 Bot 已不存在时，Client 才自动移除其钉选并恢复普通 Activity 消费；网络或认证失败保留本地选择，不作为 Bot 删除的证据。

`GET /api/botharness/companion` 通过 Connection Fetch 的原生认证返回 `{ profileId }`；标识为原生 Profile 目录的不透明 SHA-256，既不返回路径，也不包含凭据。`?botId=<slug>&dm=1|0&group=1|0&visibility=own-dm|shared|all-bot` 返回 SSE：`companion/baseline` 和 `companion/activity` 含 Registry 形象与现有全 Bot Activity snapshot，`companion/message` 仅含所选 Bot 已提交的消息 ID、Channel ID/名称、来源种类、Bot 参与者名称、现有读取可用性及最多 2000 字符的正文预览。DM 默认开启、群聊默认关闭；来源开关与范围相交。`own-dm` 仅自己的 Human–Bot DM，默认 `shared` 还允许 Human 与 Bot 都参与的群聊，`all-bot` 还允许该 Bot 的 Bot–Bot DM 及 Human 未参与的群聊。未认证真实 Host 请求返回 401。

多伙伴使用同一认证路径的 `GET ?subscribe=1` 建立一条 SSE。基线携带 `{ profileId, consumerId, selectionRevision, bots, activity }`；`consumerId` 是仅在该连接存活时有效的随机句柄，不落盘。认证 `POST /api/botharness/companion` 提交 `{ consumerId, selections: [{ botId, dm, group, visibility }], capacity, revision }`，Host 验证每个 Registry 身份、重复项及容量后原子替换选择，并发送 `companion/selection` 确认。旧选择确认不能初始化新伙伴；关闭连接会注销句柄。消息带 `botId`，Client 按作者派送至独立伙伴；Bot–Bot DM 使用 DM 开关；未传群聊/范围字段的旧消费仍默认群聊关闭、shared 范围。

Channel owner 的应用定义 `observeOutput(channelId, messageId)` 从规范 placement/source 查找单条正文与作者，返回当前 Human 参与关系及原 timeline 的读取可用性；SQL 路径按 Channel/message 索引定位，不扫描完整历史或返回 Tool 参数、结果、附件和投影详情。Feed 按 Registry 活跃身份、当前 Bot 成员关系、作者、开关及范围验证后推送；背压队列只保留有界消息引用，改变选择时过滤并在排出前重查。较广观察不修改通用 Channel 读取/发送、Human 成员关系或模型权限。Bot–Bot DM 的现有 Human timeline 可读性保持可用；Human 未参与的 Group 仍不可读，卡片保留来源并解释。

Host 同步注册消费者后写基线，不扫描旧消息；Client 首次连接、失效租约的新基线或 Host generation 变化清空过程卡片；同 Host 的 recovered 基线保留阅读进度和去重；显式切换来源或范围时只移除不再符合条件的已显示和排队卡片，同一 generation 的确认基线保留其阅读进度，增加另一个伙伴不清空正在阅读的已有卡片。重启只恢复 Client origin × Profile 的 v2 选择与全局容量，兼容迁移 v1 单伙伴选择，消息不持久化。默认折叠三层、保留二十条；设置接受整数，层数范围 1–10、保留范围 1–100，层数不超过保留量。Activity 合并为一个待发送快照；Host 每个 Bot 的待发队列、Client 每个 Bot 的保留与阅读中待到达队列分别受同一保留量约束，已见 ID 另外最多四倍保留量。阅读中的卡片不因其他 Bot 到达而移动锚点；展开高度与折叠层溢出都纳入基本避让，文字揭示及预览截断保持完整字素。

选择 POST 的暂时失败会在 250ms、1000ms 各重试一次，仍失败保持 stale，后续选择变化或新连接基线可重新同步；旧 consumer 的失败不能污染新连接。只有最新 revision 的选择确认能释放失败状态。取消选择、关闭连接和 Plugin 卸载清理重试与消费资源。原生 EventSource 的 `Last-Event-ID` 指向同一 Host 的过程消费租约；短暂断线最多保留 60 秒、128 个断开租约，每 Bot 保存不超过 retention 的规范消息引用。POST 的每个 selection 可带四类来源 `epochs`（own-dm、bot-dm、shared-group、bot-group），旧 Client 未提供 epochs 时保持未来基线。重新连接先确认最新 selection，再重查合格引用；来源关闭再开启或新资格的 epoch 变化建立 owner placement 基线，禁用期不补播。规范位置而非 Client／Host 墙钟排除基线前的延迟通知；recovery 对每条引用有界点查，不读完整历史。相同 generation 的 recovered 基线保留阅读进度和 Channel/message 去重；Client／Host 重启、租约失效开始新基线。页面隐藏取消 RAF，返回重置采样时钟，不计隐藏时间。最后一个伙伴移除后恢复普通页面的 Activity 消费。

选中伙伴时，伙伴 feed 也供给共享 Activity store；不要同时打开独立 Activity SSE。真实 RC1 Windows Web 验证中，额外 SSE 曾使 Bot 模式的 DM 发送停在发送中，退出模式后恢复。合并消费后，同一模式内连续三条真实提交完成。此症状符合浏览器同 origin HTTP/1 长连接额度耗尽，具体连接计数未直接测量。

### Companion identity and presentation lifecycle

The Companion Feed observes committed `bot-registry` notifications directly, independently of Bot mode, through one disposable subscription. Selected archives remain labelled and still; canonical pause/reactivation changes reset the bounded message references and source checkpoints. A process-local lifecycle token survives stream recovery and makes a coalesced archive/reactivation transition observable without creating durable identity state. Confirmed deletion sends removed IDs through the acknowledged shared snapshot; the collection releases only those children, preferences and cards, while stale revisions cannot restore them. Uploaded images keep their media and whole-object interaction; unsupported rig/schema versions retain the saved recipe and versioned snapshot with an explicit animation limitation. The image owner refuses an obsolete version URL instead of serving a different Avatar. Keyboard focus expands reading like hover, Context Menu/Shift+F10 opens native options, Escape returns focus, and card dismissal selects a surviving control. Effective reduced-motion changes settle immediately, offscreen/hidden stages stop sampling, and all observers, frames and morph/fade animations are cancelled on disposal; obsolete animation completions cannot enqueue fresh motion. Actual multi-Bot frame/memory/asset measurements and Human-agreed budgets remain required before performance acceptance.

Current formal Tool Approval and user-question requests come from their existing live owners through disposable Feed observations. Each selected active Bot snapshot includes its committed pending requests, independently of Activity/DM/group display switches and decorative retention. These requests remain in a persistent, scrollable section until the owner settles or expires them; historical Channel messages cannot recreate a live request. Shared Chat cards let the Human decide or answer directly from a companion, using an explicit live Bot/DM/Session target and fresh owner status before the existing decision/answer RPC. Ordinary Chat retains its selected-conversation guard. Offline controls are disabled; current-state reconciliation preserves mounted question drafts, while unpinning only removes the presentation and never answers or cancels the request. Canonical acceptance resolves only the original waiting native call ([ADR-0150](adr/0150-window-companion-requests-use-their-live-owners.md)).
