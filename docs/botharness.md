# BotHarness 规格（PoC）

> **历史工作草稿，不再是设计权威，也不发布到文档站。** 当前产品术语以 `CONTEXT.md` 为准，整合后的目标架构以 `docs/architecture/botharness-architecture.md` 为准，取舍与理由以 `docs/adr/` 为准。

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本     | v1.17                                                                                                                                                                                                                                                                                                                                                                   |
| 日期     | 2026-09-20                                                                                                                                                                                                                                                                                                                                                              |
| 状态     | Archived working draft                                                                                                                                                                                                                                                                                                                                                  |
| 形态     | DSH 插件层：SDK 包 + bundle（**不 fork DSH**，ADR-0015）                                                                                                                                                                                                                                                                                                                |
| 首个应用 | **DeepSeekBot**（见 `PRD.md`）                                                                                                                                                                                                                                                                                                                                          |
| 决策记录 | `docs/adr/`（v1.17：ADR-0029/0017/0024/0045 收敛 PersonaBot navigation 与 Assignment 术语；v1.16：ADR-0046 确立 Host-owned PersonaBot ID、名称式 mention 与多岗位徽章；v1.15：#56 / ADR-0031/0034 落地混合 `topOrder`、稳定拖拽布局与松散 Channel；v1.14：0035–0045 确立 Session ownership、Messaging、统一 operational database、可移植性与 Assignment control plane） |

## 1. 定位与缺口

- 现有 LLM harness（含 DSH）以 session 为单位：跨 session 至多是一份"云记忆"，**没有带人格、持久身份的 Bot 实体**。
- BotHarness 在 DSH 之上补这一层：**PersonaBot**（persona + 跨 session 记忆 + 状态 + 工作），以 SDK + bundle 交付，内核不动。
- 灵感：Grok Bot（每个 Bot 有自己的电脑、记忆、状态、自主工作）；DeepSeek Harness（插件宿主，"承载其他插件"）。
- 消费方：DeepSeekBot（首个应用）、IM 适配器、Live2D 渲染器（独立、后置）。

## 2. 实体模型

| 实体                            | 定义                                                               | 关键关系                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **PersonaBot**                  | 一等身份：persona、profile、Memory、状态和 Bindings                | 同时最多一个 active Orchestrator，可拥有多个 Assignment Sessions（ADR-0016/0024）                                |
| **Session**                     | DSH 执行单元；普通 DSH Session 可不属于任何 PersonaBot             | Bot-mode Session 通过 durable explicit ownership 归属，正常运行不以 `cwd` 猜测（ADR-0035）                       |
| **Orchestrator Session**        | PersonaBot 唯一 active 的长期 dispatch root                        | 消费 Bot Inbox，决定回复、创建/复用/停止 Assignment（ADR-0024/0045）                                             |
| **Assignment Session**          | 一条工作的 independent DSH root；canonical id = DSH `sessionId`    | 由 Assignment Directory 寻址；Continuity Key 是 PersonaBot-local alias；DSH Subagent 不算 Assignment（ADR-0045） |
| **Workspace**                   | 单个主机目录，与 DSH workspace 1:1                                 | Session 显式关联；restore 后必须在目标机重新映射（ADR-0018/0044）                                                |
| **Source Event**                | 来自 Channel、Bridge、webhook、Session 或 system 的 immutable fact | 唯一保存内容；Channel placement 与 Inbox Admission 只引用它（ADR-0036/0037）                                     |
| **Channel**                     | 平台内 `dm` / `group chat` 对话空间                                | 由 Messaging operational facts 投影，不再以 NDJSON 作为独立权威（ADR-0026/0030/0037）                            |
| **Bot Inbox**                   | PersonaBot 的 admitted Source Event 视图                           | 非队列、非内容副本；Attention Decision 记录 observed/deferred/ignored/handled（ADR-0025/0036）                   |
| **Inbox Trigger / Wake Policy** | Host-owned admission rule 与安全唤醒时机                           | Bridge 只送 verified event，不直接唤醒 Agent（ADR-0025/0036）                                                    |
| **Reply Route / Service Grant** | 来源回复路由与主动 provider action 授权                            | Reply 自动走可信来源；主动发布必须有 capability + Human grant（ADR-0038）                                        |
| **Outbox Intent**               | 一次外部副作用的 durable intent                                    | 稳定幂等 identity + bounded reconciliation；不宣称 exactly-once（ADR-0039）                                      |
| **Channel section**             | bot-mode sidebar 的可折叠 Channel 分组                             | Host operational state；排序偏好仍在 `ui-bot-mode` settings，折叠在浏览器本地（ADR-0031/0034）                   |
| **Memory**                      | 文件优先的持久知识（§4）                                           | 只通过 explicit Session ownership 解析；不会由 Inbox/Report 自动蒸馏（ADR-0021/0035）                            |

目录约定：

- `$DSH_HOME/botharness/bots/<personabot-id>/bot.json`：机器元数据（Host-owned PersonaBot ID；当前 JSON 键为 `slug`、`displayName`、`roles[]`、description、avatar、模型/preset、workspaces、bindings、`capabilities.tools.allow`）。
- `SOUL.md` / `MEMORY.md` / 主题文件随**用户配置的记忆目录**走（默认在 `bots/<personabot-id>/memory/`）。

### 2.1 持久化地图（ADR-0034/0041/0042）

一个 profile 使用一个 `$DSH_HOME/botharness/botharness.db` 承载 BotHarness operational facts。它提供共享本地事务，但不是 generic repository：PersonaBot、Messaging、Assignment、Portability 各自拥有表、commands 和 invariants。Host-lifetime owner 获取 OS writer lease；单调 Schema Generation 在 isolated temporary copy 中迁移并校验，再 atomic replace。失败时进入 recovery mode，不回退其他写路径。

这是终态权威图，不掩盖迁移阶段：#66 已实现的 roster 当前仍由 `botharness_roster` storage domain 承载；#79 先建立 database owner，#80 再把 roster 与 Session ownership 单向迁入数据库。迁移提交前不双写，也不把尚未迁移的表描述成已经存在。

当前 roster global 槽为 `{ pins, hidden?, sectionOrder, topOrder? }`；`hidden` 是不改 placement 的可逆 navigation omission，`topOrder` 混排 section block 与松散 Channel，缺省表示 pre-flat 域并由客户端一次性迁移。绝对顶层位置通过 `topReorder` 写入，隐藏列表通过第九个 roster 桥方法 `hiddenSet` 写入；Host 在 assign/create/remove/reorder 时维持“section 成员不能同时有 loose entry”的单一归属不变量（ADR-0034）。

| 类别                                                                                                                            | 权威位置                                                           | 说明                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| PersonaBot operational identity、Session ownership、roster、Messaging、Attention、Outbox、Assignment Directory、export metadata | `botharness.db`                                                    | local ACID 权威；post-commit 才通知 Agent/UI；浏览器不能直连                              |
| Persona / Memory                                                                                                                | `$DSH_HOME/botharness/bots/<personabot-id>/memory/` 或用户配置目录 | 人类可读文件权威；git history 可选实现，不把内容复制进 DB                                 |
| Attachment / Soul bytes                                                                                                         | BotHarness content-addressed files                                 | DB 只存 identity、metadata 与 refs；共享内容只保存一次                                    |
| DSH Session transcript / execution                                                                                              | DSH SessionPersistence                                             | BotHarness 只保存 ownership、DSH-derived activity/last-run projection 和 semantic reports |
| Credentials / DSH settings                                                                                                      | DSH credentials/settings services                                  | 不复制进 DB、export 或 backup；仅保留非秘密 dependency/account refs                       |
| UI sort preferences                                                                                                             | `ui-bot-mode` DSH settings                                         | sidebar 与 General 设置共用；属于 DSH-native preference                                   |
| 纯瞬态 UI                                                                                                                       | browser state / localStorage                                       | 折叠、选中、临时输入等；不成为领域事实                                                    |

- 旧 `bot.json`、Channel NDJSON、storage-domain operational records 只作为 forward migration 输入；#80 成功迁移对应数据后不再形成双写或第二权威。
- 跨模块原子流程只能调用 owning module 提供的 transaction participant；不得让 UI、provider adapter 或插件直接操作 tables。
- Profile Backup 是 Human 手动触发的单文件快照流程（§5）；SQLite 临时 migration copy 不是 backup 产品。

## 3. 状态模型

- **Session 级**（真实进度）：`thinking` / `working` / `waiting` / `blocked` / `done`（无活动即 `idle`）。
- **PersonaBot 级**（聚合）：precedence `blocked > waiting > working > thinking > idle`；`done` 是 Session 事件，聚合态随即回 `idle`。
- 语义：`waiting` = 等审批/等人；`blocked` = 失败或缺条件。
- 状态事实以 DSH Session lifecycle 为权威；BotHarness 只按 explicit ownership 聚合 PersonaBot 状态，并保存 DSH-derived activity / last-run projection。当前 `BotStateTracker` / `states.on(...)` 只是 core 进程内的过渡 callback seam，不是 Cordis Event、Client wire contract 或 durable authority；浏览器 roster 经客户端桥读模型 + 刷新/轮询取状态（ADR-0023，`docs/client-bridge.md`）。终态若向 IM adapter、插件或 UI 通知变化，也只能在 owning module 的事务提交后发布；当前尚未定义公开 Cordis event 契约。Live2D 后置，消费更原始的模型/工具/响应信号（见 §8 开放项）。

## 4. 记忆（文件优先）

```text
<memory-dir>/                  # 用户可配；默认 $DSH_HOME/botharness/bots/<personabot-id>/memory/
├── SOUL.md                    # Soul：性格、语气与常驻指令；Session 冻结注入（ADR-0134）
├── MEMORY.md                  # Core Memory：常驻索引与关键事实；Session 冻结注入（ADR-0134）
├── customers/                 # 客户档案（北极星场景）
│   └── acme.md                # 时间线 + 关键事实 + 待办 + 关联附件（front-matter）
├── topics/ journal/ ...
└── .git/                      # 每 PersonaBot 一个 repo，仅记忆目录
```

读写规则：

| #   | 规则                      | 说明                                                                                                                                                                                            |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | 文件是唯一事实源          | 纯 Markdown + YAML front-matter：`summary`、`updated_at`、`sources`，选填 `tags`；缺失/非法时降级（首行摘要 + mtime），不阻塞（ADR-0012）                                                       |
| M2  | 原子写                    | 写临时文件 + `rename` 原子替换；禁止原地截断；同一 PersonaBot 串行写；工具路径 jail 在记忆目录，拒绝越界                                                                                        |
| M3  | 目录树进上下文 + 按需检索 | 通过 explicit Session ownership 取得对应 PersonaBot；persona 静态前缀 + 选定 Memory/tree，细节用 `memory_search` / `memory_read`。精确 budget 与 replace/dedupe 契约由 #74 收口                 |
| M4  | 显式来源                  | 来源写入 front-matter `sources`（群 / 会话 / 日期 / 发送者），便于审计与回滚                                                                                                                    |
| M5  | 人类可编辑                | UI 提供编辑器；冲突策略：mtime/hash 检测后**拒绝保存并展示差异**（不自动合并）                                                                                                                  |
| M6  | 可备份/可回滚             | Memory 目录可读、可复制；当前实现以每 PersonaBot 一个 git repo 留历史。PersonaBot Export 可选 Memory；Profile Backup 通过一致性 barrier 把文件纳入单个手动 `.botharness-backup`，不引入自动备份 |
| M7  | 防污染                    | 记忆写入可配置为「需确认」；可选定期人工 review（默认关）                                                                                                                                       |
| M8  | 敏感信息                  | 凭据严禁写入记忆；发现疑似密钥时告警并脱敏（扫描规则）                                                                                                                                          |
| M9  | 写入时机 = 工具写         | 仅由模型显式调用记忆工具落盘；无自动蒸馏、无后台批量改写（PoC）                                                                                                                                 |
| M10 | 入站文件归属              | 入站附件先作为 Source Event 引用的 content-addressed bytes；只有 Agent/Human 明确保存时才进入 PersonaBot Memory 或 Workspace。provider URL 不作为稳定引用，TTL 与长期 Memory 解耦               |
| M11 | 分享边界在导出时决定      | store 不存可见性：Bot 读取全部记忆；导出（M6）时由人选择哪些文件、哪个时间点进入包（ADR-0021）                                                                                                  |
| M12 | 注入位置与缓存            | persona 静态段留在 system prompt 前缀；memory tree 改为每 turn 注入的独立消息（替换语义 + 与上次注入比对去重），保持前缀字节稳定以命中 KV cache（M3 的落地细化）                                |

## 5. 工作方式

- **Source Event 与 Inbox**：Channel、Bridge、webhook、Assignment Report 和 system notice 都先成为带可信 provenance 的 immutable Source Event；内容只保存一份。Inbox Trigger 在同一个 Messaging transaction 中建立 PersonaBot-specific Inbox Admission 与 Attention。list 不等于 observed；observed/deferred/ignored/handled 是独立事实（ADR-0025/0036/0037）。
- **Edit / recall / echo**：edit/recall 追加 Source Revision，不原地覆盖；先到的 revision 保持 unresolved，冲突不按 arrival time 猜。provider echo 若能与 outbound identity 关联，只补充原 Source Event/receipt；未匹配的 own-sender echo 不 wake（ADR-0036/0039）。
- **Wake Policy**：Trigger 指定 immediate / digest / silent 及安全边界。普通消息不会打断正在执行的 model/tool step；immediate 在当前 step 完成、进入下一 step 前注入，或 idle 时启动新 turn；需要等当前 turn 的策略在 turn 结束后 followup。具体映射由 #77 在 pinned DSH 上验证。
- **Orchestrator Session**：每 PersonaBot 同时一个 active root；从 Bot Inbox 接收 attention，决定直接回复、读取/询问已有 Assignment、创建新 Assignment 或 defer/ignore。replacement 不改变 PersonaBot 对 Assignment 的 authority（ADR-0024/0045）。
- **Assignment Directory**：durable、PersonaBot-scoped，按需 `list_assignments` / `inspect_assignment`；默认 current-attention、`updatedAt desc, sessionId` 稳定排序，支持 filters、sort、page size 与 opaque cursor。DSH activity/lastRun 与 latest semantic report 分开；内部 Subagents 只聚合展示。
- **Assignment control tools**：Orchestrator 独占 `create_assignment`、`send_assignment_request`、`stop_assignment` 与查询工具；Assignment 只拥有 `report_to_orchestrator`。v1 不允许 Assignment-to-Assignment direct messaging；Orchestrator 解析 exact target 后中转（ADR-0045）。
- **并发准入**：profile-wide active independent Assignment 上限默认 3，可由 Human 在全局 Settings 设置 1–32；Orchestrator 只能读取。达到上限时 create/idle-wake 立即返回 stable code、`activeCount`、`limit`、`retryable` 和可读说明；不排队、不写 intent、不创建 Session。降低上限不 cancel 已在运行的 Assignment。
- **Assignment delivery**：`context-update` 不 wake；`next-step` 在下一个安全 step 边界 steer；`next-turn` 在本 turn 后 followup。跨 SQLite/DSH 用 stable request/dispatch id 的最小 Assignment Delivery Intent；bounded reconciliation 后仍歧义则 `needs-repair`，不实现 workflow engine（ADR-0045）。
- **Assignment 回报与状态**：Agent-authored Assignment Report 和 Host-authored Lifecycle Notice 都作为不同 provenance 的 Source Event 进入 owning Orchestrator Inbox。milestone、blocked/waiting-human、terminal 触发有意义的 report；未观察的重复可共用 Attention，但 immutable facts 不合并。完整执行历史只在 DSH SessionPersistence。
- **Messaging 与权限**：Reply 使用 Source Event 的 trusted Reply Route，由 Host 选择 provider/destination；主动向指定飞书 channel/thread 发布是 Service Action，必须有 adapter capability 和 Human Service Grant。wildcard grant 可由 Human 明确授予，默认不过期；account/target/revision 仍在 intent 接收和 side-effect 执行时双重校验（ADR-0038）。
- **Outbox**：外部副作用先 durable intent 后执行；adapter 能提供幂等键/结果查询时用于 reconciliation。request 已开始但结果无法证明时进入 `unknown-outcome`，禁止自动重发，由 Human 明确 resolve（ADR-0039）。
- **归档与停止**：archive 先在事务内关闭新 admissions、wakes、Assignment requests 与 external actions，再停止 Orchestrator、Assignment Sessions 和 owned Subagents；保留 identity、history 与 audit。reactivate 创建 fresh Orchestrator，不自动 resume 旧执行。
- **导出与备份**：PersonaBot Export 默认 Persona + selected Memory，可勾选 dependency-closed operational facets，但 credentials 永不导出。Profile Backup 只有手动 Export/Import 两个动作，生成一个 self-contained compressed `.botharness-backup`；没有自动备份、catalog、retention 或 incremental chain（ADR-0040–0044）。
- **工具面**：per-PersonaBot allowlist + role-specific restriction；未知工具名过滤并告警。Orchestrator、Assignment Agent、Subagent 的工具面不同，具体 DSH seam 由 #77 验证。
- **模型选择**：全局默认 + per-PersonaBot desired model；restore 时不 silent fallback。目标机无法解析时对应 capability `blocked`，由 Human 显式 remap（ADR-0027/0044）。
- **Bot 模式 UI**：sidebar = 置顶 BOT 网格（始终手动）＋一个混合顶层序列（可折叠 Channel section 与未归属的松散 Channel 可交错）；未分组是 membership 状态，不再有固定底部 bucket/header。点击 PersonaBot 打开 DM Chat；DM 的右侧 PersonaBot navigation 以 Chat、Memory 为主入口，并在其下直接平铺该 Bot 的 `事项` 列表；Orchestrator Session 不作为事项显示。点击事项打开只读详情，原始 DSH Session 仅通过显式次级操作进入。group Channel 不显示此导航；Workspace 不在 sidebar 呈现。折叠 sidebar 后，Roster 变为可滚动头像/icon rail，点击只切换 DM/Channel、不自动展开（ADR-0029/0031）。
- **sidebar 操作（ADR-0031）**：头部 = `Bots` 标签 + 右侧 **search → `...`（More：排序＋隐藏频道管理）→ `+`（创建菜单）**；section 头 `+` 在区内建 Channel，`...` = 排序方式 → 重命名 → 删除。移动 = 原生 HTML5 DnD＋右键「移动到」；Channel 行、section 头/体、section 边界间隙都是真实 drop target：投到 section 归属该 section，投到边界间隙则保持未分组并写入该顶层位置。section header 投放插入第一项；预测线绝对定位、不占布局，源行留在原位以 40% opacity 淡出。DM 与 group Channel 都可隐藏；隐藏只从 expanded roster、pin grid、search 与 collapsed rail 省略，恢复保留原 pin/section/order。陈列当前存 Host `botharness_roster`，经九个细粒度 roster 桥方法读写（含 `topReorder`、`hiddenSet`），并按 #80 计划单向迁入 `botharness.db`；排序偏好在 `ui-bot-mode`，折叠状态在浏览器本地。
- **排序模式（ADR-0031）**：每个 section 三态 `updated` / `manual` / `inherit`；全局默认在头部 `...` 菜单设置。首次手动拖拽或拖入 section 切 `manual` 并冻结当前顺序，源 section 模式不变，「恢复自动」回 `inherit`。松散 Channel 的顶层位置是显式陈列，在所有排序模式下保持不动；section 内发送消息仍按新 `updatedAt` 即时重排。section 头为 Discord 式 24px muted→solid、无 hover 背景、右侧 `IconChevronDownOutline14`；Channel 行 32px，区块间距 12px。
- **头像与活动（ADR-0046/0049）**：默认头像由 Host-owned PersonaBot ID 确定性生成 Blobatar；同一个 Avatar module 在 DM Channel、Pin Grid、消息与 composer activity row 中消费 PersonaBot Activity Projection。Blobatar 可在 thinking/working 时运动；自定义图片保持静止，由外层 Activity Frame 表达状态；群 Channel 使用字形或最多三个头像与 `+N` 的 facepile。DSH 字形缺口仍以 vendored Lucide（ISC）首方组件补齐，并随包附 `THIRD_PARTY_NOTICES.md`。
- **实时同步（v1.1，ADR-0034）**：`botharness` 命名空间加 `mode: 'stream'` remote 方法（Host AsyncIterable、客户端 `connection.rpc.open`），先推 roster 变更、后推 channel 消息，IM 式；`domain/changed` 是进程内事件且不可转发（api-remotes 白名单静态），客户端不得依赖；现有 unary 方法面不变。
- **排序偏好设置行（#68，ADR-0034）**：Settings → General 加一行 `settings.general.item`（与对话显示/忙碌发送/主题同模式），暴露与 sidebar `...` 菜单相同的 `ui-bot-mode` 排序偏好——一个 policy store、两个入口；该设置行**不迁移任何既有 sidebar UI**，只是新增入口。General 行槽位在 dev 中不可靠时退到 cookbook 标准的 `settings.plugin.item` 卡片（记录为 fallback）。
- **创建与 onboarding**：最小表单收名称、0～多个可选岗位徽章与可选简介；Host 自动生成 PersonaBot ID，填写人格时写入 `SOUL.md`，并写入 `MEMORY.md` 模板（ADR-0134）。名称是列表与 `@` picker 的可见标签，mention token 保留内部 ID，同名由头像与徽章消歧。Builder 对话创建后续按需进入；`bot_create` 由工具白名单控制（ADR-0029/0046）。
- **落地节奏**：#77 与 #79 可并行；#80 依赖两者；#81 再实现 Assignment。#75 的 Inbox/Assignment UI design 可与 sidebar #55 并行；#78 的 Feishu contract research 可并行，但阻塞 #48 adapter implementation。
- **已知约束**：DSH AgentHandle、cold/idle wake、inject/steer/followup、SessionPersistence export 和 continuable Subagent 都是 developer-preview seam；在 #77 完成真实版本验证前不得把文档假设当 production guarantee。
- **Task 不存在**（ADR-0017）。

## 6. 插件层与包

- 交付形态：SDK 包 + bundle（`cordis.patch.yml`），不 fork DSH。
- 包（monorepo，包边界先行；第二个消费方出现再拆仓）：

| 包                 | 内容                                                                                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@botharness/core` | Host composition root + deep modules：PersonaBot/ownership、Memory、Messaging、Assignments、Portability、read models；共享 DB owner 不等于共享 repository |
| `@botharness/ui`   | DSH-native React UI：roster、DM/Channel、Bot Inbox、Assignment Directory、Settings、recovery/readiness flows                                              |
| `@botharness/im`   | Provider adapter 边界；首个为 Feishu/Lark。负责 verified normalization/capabilities/execution，不拥有 Inbox 或授权                                        |
| `deepseekbot`      | bundle + app：声明 layer、组装 packages、暴露 Host RPC/Client slots                                                                                       |

- 扩展面：其他 Host 插件可读 registry、订阅状态事件、注册 renderer；不提供路由与回复位置的覆盖（沿用 ADR-0011，路由类需求走上游）。
- 客户端事实：DSH 客户端组件是 React，且浏览器半侧是**独立 Cordis 应用**——不能 `inject` host 服务；客户端经**客户端桥（读模型 RPC）**读写 PersonaBot（ADR-0023，规格 `docs/client-bridge.md`）。shell 只共享 `react`/`react-dom` 等基线，第三方依赖必须打进 lazily-loaded bundle（blobatar 走这条）。
- 插件配置走 DSH 规范通道：导出 `Config` + `apply(ctx, config)`，`enabled` 是组合层开关；settings 卡片推迟到 M3+ 以 `installSection` + 动态注入回归（ADR-0022）。
- 客户端设计系统：in-harness UI 使用 DSH design tokens（`--dsw-*`）与基线 `@deepseek-ai/dsh-client-ui-primitives`，随宿主浅/深主题；COSS 仅用于 docs/landing（ADR-0028）。图标优先用基线字形，缺口以 vendored Lucide 字形（ISC，首方组件 + `THIRD_PARTY_NOTICES.md`）补齐，仍不引入组件库（ADR-0032）。

## 7. 里程碑

| #    | 交付                                                                                                                     | 状态             |
| ---- | ------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| M1   | **BotHarness 骨架**：core 包、PersonaBot registry、bot home（`bot.json` + 记忆目录）、状态事件、设置/存储                | 已完成（PR #13） |
| M2   | **记忆 MVP**：布局 + front-matter + 目录树注入 + `memory_*` 工具 + 原子写                                                | 已完成（#9）     |
| M3   | **Bot 模式 IA 与聊天外壳**：sidebar 列表/Section、DM Chat、PersonaBot navigation、files-first Memory 入口与 Builder 创建 | 进行中（#10）    |
| M3.5 | **安装与 DSH seam 验证门**：真实 bundle/UI 冒烟（#24）+ Assignment runtime seam matrix（#77）                            | 待开始           |
| M4   | **演示闭环**：先交付 DB owner（#79）、Session ownership（#80）、Assignment Runtime（#81），再完成文件研究助手            | 待开始（#11）    |
| M5   | **IM 适配器**：dsh-im 绑定、Lark 国际版验证、客户跟进场景                                                                | 待开始（#12）    |
| —    | **v1.1（post-PoC）**：Messaging、Bot Inbox、Orchestrator/Assignment UI、Bridge（#30、#46–#48、#75、#78）                 | 规划中           |
| M6   | **Soul / portability**：SoulSnapshot + PersonaBot Export；Profile Backup/Restore/Transfer UI 先由 #76 收口               | 待开始（#17）    |
| M7   | **Soul registry / Marketplace**：BetterAuth、R2、PlanetScale、公开上架与下载；插件一键分享随后                           | 待开始（#18）    |
| —    | Live2D：独立 effort，后续单独 grill/wayfinder                                                                            | 暂缓             |

## 8. 风险与开放问题

| 风险                                | 缓解                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| DSH preview seam 与实际版本不一致   | #77 在 pinned build 做 PASS/FAIL/UNVERIFIED matrix；adapter 隔离，失败即修正设计                                                 |
| SQLite 与 DSH/provider 无法原子提交 | minimal stable-id intent、idempotent acceptance、bounded reconciliation、`needs-repair` / `unknown-outcome`；不假装 exactly-once |
| 多 Host 同时写同一 profile          | OS-backed writer lease；第二 writer fail closed，只允许 diagnostics（ADR-0041）                                                  |
| 外部消息 edit/recall/乱序/echo      | immutable revision chain、trusted provider identity、unresolved/conflict、provider reconciliation（ADR-0036/0039）               |
| Bot 循环互相唤醒                    | Bot 消息每轮按 @ 与唤醒策略唤醒，trusted hop limit 32 只防失控；超限保留事实、不唤醒，并以 `notWoken` 告知发送方（ADR-0261）     |
| 主动外部动作越权                    | capability 与 Human Service Grant 分离，并在 intent/execute 两次校验；credentials 永不进 DB/backup（ADR-0038）                   |
| Orchestrator 中枢成本与单点         | Attention coalescing、digest、按需 Assignment query；replacement 继承 PersonaBot-scoped authority，不依赖内存句柄                |
| profile transfer split-brain        | source fencing、Transfer Generation、target activation receipt；Disaster Restore 显式风险确认（ADR-0043）                        |
| restore 后环境漂移                  | dependency manifest + target-local resolution；cold restore、suspended provider authority、Human activation（ADR-0044）          |
| 记忆污染 / 私事外泄                 | 显式工具写 + sources + 导出选择；并发写/context injection/promotion 由 #74 继续 focused grill                                    |
| 本地数据增长                        | SQLite/CAS 可观测指标与实现票基准；保留/purge 是显式 policy，不通过默认自动备份隐藏成本                                          |

**已从 #71 分离的开放设计/验证**：Memory/context delivery 与并发写入（#74）；Inbox/Assignment/recovery UI（#75）；Profile export/restore UX（#76）；DSH runtime seams（#77）；Feishu provider contract（#78）。具体 page size、sort/filter enum 和性能阈值在实现票中用真实数据确定，不再扩张平台级 grill。
