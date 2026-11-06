# 关系感知的 Persona/Memory 组织调研 — Letta 多主体机制 + Hermes Persona/USER 增量 + 对照既定拆分

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题     | 多主体场景（一个 PersonaBot 服务不同 Human：DM、多人 group channel、Bot-to-Bot DM）下，persona/memory 应如何按 relationship 组织，使得 (a) 按关系得体呈现、(b) 无单个 markdown 文件无界膨胀、(c) 跨 actor 偏好冲突（如 A 要简洁、B 要详细）干净解决？既定拆分（接受、不重议）：PERSONA.md 只放 actor-independent voice/conduct（per session 前缀冻结）；per-actor 偏好放该 actor 自己的 topic file，对该 actor 优先。                                 |
| 调研日期 | 2026-09-26                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 一手来源 | Letta 官方文档站 `docs.letta.com`（v1 SDK memory-blocks / shared-memory / conversations / multi-user / multi-agent 页面、Agent SDK shared-memory 概念页）；Hermes 官方文档站 `hermes-agent.nousresearch.com`（Personality & SOUL.md 页）；BotHarness 本地 `GLOSSARY.md`、`docs/research/2026-09-21-letta-memory-persona-git.md`、`docs/research/2026-09-23-hermes-agent-memory-architecture.md`。无第三方二手来源。所有 URL 访问日期 **2026-09-26**。 |
| 方法边界 | 只用一手来源；Letta 侧覆盖「v1 legacy blocks 时代」与「MemFS/shared-repo 现行时代」两个版本并注明归属。Hermes 侧只做 09-23 文件之外的增量（SOUL vs USER vs MEMORY 三分与单用户假设），不重复双文件快照/容量墙/Provider 结论。**唯写本文件**，未改动其他仓库文件、未碰代码/issues/git 状态。凡一手来源确认不了的说法标「未验证」；§3 为评估性判断、非事实陈述。                                                                                        |
| 对照基线 | `GLOSSARY.md` 的 Channel（`dm` / `group chat`）、DM、Bot-to-Bot DM、Channel membership、Customer profile（one-file-per-customer）、Topic file 词条；既定拆分（PERSONA.md 前缀冻结 + per-actor topic file 优先）。                                                                                                                                                                                                                                     |

**一句话结论**：Letta 与 Hermes 都**没有** one-agent-serving-many-humans 的 relationship-scoped persona 原语——Letta 的多用户答案是 one-agent-per-user（Identities）加跨 agent 共享块/仓，Hermes 的答案是 one-profile-per-bot 加单一 SOUL/USER；Letta conversations 甚至是反例：同一 agent 的全 conversations 共享同一套 memory blocks，跨 relationship 的偏好冲突在平台内无解。这支撑既定拆分：per-actor 偏好必须由**调用方按 relationship 选择**（actor 自己的 topic file + 对该 actor 优先），而不是指望平台级 relationship scope；group channel 的多人同场冲突与 Bot-to-Bot DM 的双向适配是两边都没回答、留给我们的开放问题。

---

## 1. Part 1 · Letta 一手事实（多主体相关子集）

### 1.1 persona/human blocks：agent-global、有界、进 prompt 前缀

Memory blocks 是 agent context window 内的持久结构段，always visible、无需检索；底层以 XML-like 形式 prepend 进 prompt，每块带 `chars_current`/`chars_limit` 元数据（示例中 limit 为 5000）。`persona` 与 `human` 是两个保留 label（不提供 description 时自动生成默认描述）：persona 存 agent 自身身份与行为方式，human 存其对话的人的关键信息与偏好。聊天应用的官方推荐就是创建 human + persona 两块。([Memory blocks](https://docs.letta.com/v1-sdk/memory/memory-blocks/)；另见 [blog: Memory Blocks](https://www.letta.com/blog/memory-blocks))

要点：(1) persona/human 是**整个 agent 全局**的，没有 per-conversation / per-user / per-channel 变体；(2) 有界（字符上限是 blocks 的一等概念）；(3) v1 SDK 页已明确标注 legacy：「不推荐继续基于 memory blocks 构建，新工作用 shared memory repositories，尽力把 agents 迁到 MemFS」([Shared memory, v1 SDK](https://docs.letta.com/v1-sdk/memory/shared-memory))。

### 1.2 Shared blocks：一块多挂、单写多见、只读块

创建一个 block，经 `block_ids` attach 到多个 agents（supervisor + worker 各自保留自己的 persona，共享同一 `organization` 块）；任一 agent 更新后所有挂载者即时可见；支持 attach/detach、按 block 列出 agents、外部经 API 全量覆盖更新（`blocks.update` 是替换不是 append）。只读块：agent 可读，但 memory tools 拒绝修改，适用于 reference data / policies。([Shared memory 指南](https://docs.letta.com/guides/agents/multi-agent-shared-memory))

官方用例模式含一组方向关键的条目：**User Profile (Multi-Agent)**——`user_preferences` 块挂到「服务同一 user 的所有 agents」，agents 读来个性化、sleep-time memory 负责整理。方向是**多 agents 服务一 user**，与我们的问题（一 agent 服务多 humans）正好相反；Letta 没有「一 agent 挂 N 个 user_preferences、按 relationship 切换」的模式。([同上](https://docs.letta.com/guides/agents/multi-agent-shared-memory))

### 1.3 共享块的并发语义：操作分级 + 指定 owner，无优先级规则

同一指南的并发表：`memory_insert`（append）并发安全；`memory_replace`（定向改）基本安全（target 字符串变了则失败）；`memory_rethink`（全量重写）last-writer-wins。官方建议：指定一个 agent（或 sleep-time memory）做重编辑的 owner，其余只 append；反模式是多 agents 同时 `memory_rethink` 同一块导致更新丢失。([同上](https://docs.letta.com/guides/agents/multi-agent-shared-memory))

对照意义：Letta 用**拓扑（谁允许做哪类写）**解决写冲突，没有「A 的偏好 vs B 的偏好谁优先」这类**读时优先级规则**——因为那类冲突在它的设计里不会出现（见 1.4/1.5）。

### 1.4 Conversations：关键反例——多会话共享同一记忆，跨用户亦然

Conversation 是 agent 内的一条消息线程：单 agent 可并行多 conversations，各自独立 context window 与消息历史，但**全 conversations 共享同一套 memory blocks 与可检索消息池**；任一 conversation 的 block 更新对其他全部可见。官方「何时用 conversations」明确把「clearly distinct interaction sessions（e.g., different user sessions, different tasks）」列为用途：context window 分开，但「still sharing the agent's learned memory」，以防无关消息污染对方上下文——注意，被隔离的只是**上下文**，**记忆是故意共享**的。([Conversations](https://docs.letta.com/guides/agents/conversations)；概念页：「One agent can have many conversations, and every conversation uses the same agent identity and long-term memory.」[Concepts: Conversations](https://docs.letta.com/concepts/conversations))

含义：若 A（要简洁）与 B（要详细）是同一 Letta agent 的两个 conversations 的用户，两人的偏好会写入**同一个 human block**，平台不提供任何隔离或冲突解决——这正是既定拆分要解决、而 Letta 未解决的问题。Conversations 是「问题存在性」的证据，不是解法。

### 1.5 Identities（multi-user）：one-agent-per-user，无 agent 内 relationship scope

Identity 对象：`identifier_key`（应用侧用户唯一 ID）、`name`、`identity_type`（`org` | `user` | `other`）、`properties[]`；创建 agent 时经 `identity_ids` 绑定，或事后 attach/detach；可按 `identifier_keys` 列出某用户的 agents；轻量替代是 agent tags。指南开篇即定调：「each user is associated with a specific agent」（每个用户关联一个专属 agent）。([User identities](https://docs.letta.com/guides/agents/multi-user)；API 侧 Identity schema 见 [Agents API](https://docs.letta.com/api/resources/agents)、attach/detach 见 [Identities](https://docs.letta.com/api/resources/agents/subresources/identities))

含义：Letta 的多用户隔离单位是 **agent 散列**（per-user agents），不是 agent 内的 relationship 切分。一个 agent 同时服务多 humans 并按关系呈现——在该模型里不存在。

### 1.6 Groups：agent 间协作编排，无 human 关系维度

Group 实体经 manager 编排多 agents（manager 类型：round-robin / supervisor / dynamic / sleeptime 等）；内置跨 agent 消息工具（单播、同步等回、按 tags 群播的 supervisor-worker 模式）；agents 间共享状态走 shared blocks（1.2）。([Multi-agent systems](https://docs.letta.com/guides/agents/multi-agent)；Group 类型见 Rust SDK 类型文档 `letta::types::groups`)

对照 Bot-to-Bot DM：Letta 的 bot 间关系 = 消息传递 + 共享块，不存在「共享 persona」或「互相适配对方 persona」的概念——每个 agent 保留自己的 persona。这支持我们的 per-Bot repo 隔离：Bot-to-Bot DM 的对方消息是可被注意的事件，不是对方记忆的延伸。

### 1.7 Shared memory repositories（现行时代）：org 拥有的 Git 仓，与个人 MemFS 并列

| Memory                   | Ownership         | Use                                      |
| ------------------------ | ----------------- | ---------------------------------------- |
| MemFS                    | One agent         | 存该 agent 的 identity、skills、长期记忆 |
| Shared memory repository | Your organization | 多 agents 间共享知识与工作文件           |

仓库 attach 到需要的 agents；agent system prompt 列出仓库路径与顶层文件；Letta Code 把仓库 clone 到 agent MemFS 旁（`$MEMORY_DIR/../<repository-name>/`）；agent 用普通文件 + Git 工具读写，**必须 commit + push**，其他 agents 再 pull；`skills/<skill-name>/SKILL.md` 可随仓提供 skills，detach 即停止加载；仅云 agent 可用。([Shared memory 概念页](https://docs.letta.com/concepts/shared-memory/index.md)；Agent SDK 侧见 [Memory](https://docs.letta.com/agent-sdk/memory))

含义：现行时代的共享单位仍是**组织级整仓**，没有 relationship / per-user 切分；「一人一仓（MemFS）+ 按需 attach 共享仓」的拓扑与我们的「一 Bot 一仓 + per-actor topic files 在同一仓内按关系选用」正交——他们在 agent 之间拆，我们在 relationship 之间选。

### 1.8 Channels：多用户线程可见，无 per-channel 记忆范围记载

Letta app 可接 Telegram / Slack / Discord / WhatsApp；channel 会话与直接聊天并列 sidebar，「including multi-user threads」。一手文档中**未见**任何 per-channel / per-thread 记忆或 persona 范围机制（记为「未找到」，非「不存在」）。([Desktop app](https://docs.letta.com/platform/desktop-app/index.md))

---

## 2. Part 2 · Hermes 增量事实（不重复 09-23 文件）

### 2.1 三分：SOUL（身份） vs USER（画像） vs MEMORY（笔记），全是单例 per profile

Personality 页确认三分工与 prompt 栈顺序：SOUL.md（agent 身份，system prompt slot #1）→ 工具/模型 guidance → memory/user 上下文 → skills → context files（AGENTS.md 等）→ 时间戳 → 平台提示 → `/personality` 等可选覆盖。SOUL 只从 `HERMES_HOME` 加载，「a true per-user or per-instance identity, not just an additive layer」；内容规范是 durable voice/style、「stable across contexts」；「if it should follow you everywhere, it belongs in SOUL.md」。`/personality` 预设（concise / technical / teacher / …）是 session 级临时覆盖。(访问 2026-09-26：[Personality & SOUL.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality))

`USER.md`（用户偏好/沟通风格）与 `MEMORY.md`（agent 笔记）是单例双文件（详见 09-23 文件 §1.2）：**一个 profile 只有一个 USER.md**，不存在 per-interlocutor USER 文件；Bot = profile（「A Bot is a profile」，隔离 config/memory/skills/credentials/history），gateway 多平台复用但 profile 状态互不可见（09-23 文件 §1.10）。

### 2.2 缺席记录：无 relationship-scoped persona/memory 构造

截至 2026-09-26，在 Personality、Persistent Memory、Memory Providers、Profiles、Bot Mode 各一手页面中，**未找到**任何按对话者/关系切分 persona 或记忆的构造（多 USER.md、per-channel persona、relationship scope 等）。记为 absence-of-evidence。Hermes 的单用户假设是 baked-in 的：SOUL「follow you everywhere」、USER 单例、profile 即隔离边界——与我们的 one-Bot-many-humans 处于不同问题设定。

---

## 3. Part 3 · 对既定拆分的对照（评估性判断，非事实陈述）

以下各条是本调研的评价，落地前回到对应 ADR/issue 验证。

1. **支撑（a：按关系呈现）**：两边都不存在「同一 agent 按 relationship 切换 persona」的平台构造——Letta persona 是 agent-global（全 conversations 共见，§1.1/1.4），Hermes SOUL 是 profile-global（§2.1）。因此「按关系得体呈现」只能是**应用层调用方按 relationship 选择上下文**：Orchestrator 按 Channel/DM 对端选读对应 actor 的 topic file，与 PERSONA.md 叠加。这正是既定拆分的形状；平台侧没有任何更省事的 seam 可抄。
2. **支撑（b：防单文件膨胀）**：Letta 用有界块（§1.1）+ 按 label/mount 拆分 + 整仓共享（§1.7）三层防膨胀；我们的对应物是 Customer profile 已确立的 **one-file-per-X**（`GLOSSARY.md`）扩展到 one-file-per-actor，配合 ADR-0060 零注入（读时按需取、不进前缀）。建议把「per-actor topic file」写成该先例的直接延伸，而非新发明。
3. **支撑并补白（c：偏好冲突）**：Letta conversations 证明冲突真实存在且平台无解（§1.4）；Letta 只用拓扑规避（per-user agents，§1.5）+ 写操作分级（§1.3），没有读时优先级规则。所以「该 actor 的 topic file 对该 actor 优先」是我们必须**新写**的应用层规则，两边都无对应物——这是拆分中最具原创性的部分，应明确标为 application-defined。
4. **细化（只读共享 ≈ 前缀冻结）**：Letta read-only blocks（可读、tools 拒绝改，§1.2）与我们的「PERSONA.md per session 前缀冻结」是同一思想的两面：共享基线读时稳定，差异写在别处。可在 ADR/架构中引用该平行，解释为什么冻结的不是文件本身而是 session 快照。
5. **细化（PERSONA.md 的体量纪律）**：两边都给 persona 加了 budget（Letta 字符上限、Hermes「stable/broad/specific」内容规范）。我们虽无 prompt 预算压力（零注入），仍建议给 PERSONA.md 一个**内容纪律约定**（只放 actor-independent voice/conduct、定期合并），否则 (b) 会以「共享基线缓慢膨胀」的形式复发。这是对拆分的加强，不是否定无界仓。
6. **挑战（弱）：group channel 的多人同场规则仍是空白**：A（简洁）与 B（详细）同处一组时，「各 actor 文件对各该 actor 优先」无法直接给出单条回复的风格——两边平台均无答案（Letta multi-user threads 无记忆范围，§1.8）。候选项（按发言者切分、channel 默认 + 被提及者优先、最近发言者优先）需单独决策，不在既定拆分覆盖内，应开新问题。

## 4. 遗留开放问题

1. **Group 同场冲突**：多人同组时单条回复听谁的？需独立于 1:1 规则另行决策（§3.6 候选方向）。
2. **Bot-to-Bot DM 的双向适配**：对方是 PersonaBot（有自己的 persona 与记忆仓）时，本 Bot 是否为对方维护一个 actor topic file（把对方当作 actor）？对称建文件最符合既定拆分，但需确认 Human 只读检查（`GLOSSARY.md` Bot-to-Bot DM 词条）与记忆写入边界。
3. **Per-actor 文件的读时机制**：ADR-0060 零注入下，Orchestrator 何时读 actor 文件（每次读全量 vs 按需 grep）与「优先」的具体实现（prompt 叠加顺序 vs 冲突改写规则）尚未规定；建议在 tracer bullet 里固定一种可观测行为。
4. **Actor 身份键**：per-actor 文件以什么键命名/索引（Human ID、Bot ID、Channel-scoped 身份）？Channel membership 与 Actor 词条已有身份概念，需与文件命名约定对齐，防止同一人在 DM 与 group 里分裂成两个画像。

---

## 5. 一手来源与访问日期（均为 2026-09-26，除注明外）

| 来源                                                                               | 支撑内容                                                                                 |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| <https://docs.letta.com/v1-sdk/memory/memory-blocks/>                              | persona/human 默认描述、XML-like prepend、chars limit、agent 共享块                      |
| <https://docs.letta.com/v1-sdk/memory/shared-memory/>                              | legacy 声明（迁 MemFS）、共享块多挂/即时可见                                             |
| <https://docs.letta.com/guides/agents/multi-agent-shared-memory>                   | 共享块 quickstart、User Profile (Multi-Agent) 模式、只读块、并发表与 owner 建议          |
| <https://docs.letta.com/guides/agents/conversations>                               | 多 conversations 共享同一 memory blocks + 混合消息池；different user sessions 用途       |
| <https://docs.letta.com/concepts/conversations>                                    | 同 agent 同身份同长期记忆                                                                |
| <https://docs.letta.com/guides/agents/multi-user>                                  | each user ↔ specific agent；identifier_key / identity_ids / tags                         |
| <https://docs.letta.com/api/resources/agents>                                      | Identity schema（org/user/other、properties）                                            |
| <https://docs.letta.com/api/resources/agents/subresources/identities>              | attach/detach Identity                                                                   |
| <https://docs.letta.com/guides/agents/multi-agent>                                 | 跨 agent 消息工具、supervisor-worker 群播、共享块协作                                    |
| <https://docs.letta.com/concepts/shared-memory/index.md>                           | MemFS（one agent）vs shared repo（org）归属表；clone 路径；commit+push/pull；skills 随仓 |
| <https://docs.letta.com/agent-sdk/memory>                                          | Agent SDK 共享仓 sot                                                                     |
| <https://docs.letta.com/platform/desktop-app/index.md>                             | channels 并列 sidebar、multi-user threads（无记忆范围记载）                              |
| <https://www.letta.com/blog/memory-blocks>                                         | persona/human 起源（MemGPT 双块）、共享块模式                                            |
| <https://hermes-agent.nousresearch.com/docs/user-guide/features/personality>       | SOUL slot #1、per-instance 身份、三分 prompt 栈、/personality 覆盖                       |
| `GLOSSARY.md`（本地）                                                              | Channel/DM/Bot-to-Bot DM/Channel membership/Customer profile/Topic file 词条             |
| `docs/research/2026-09-21-letta-memory-persona-git.md`（本地，2026-09-21）         | MemFS/Persona/Memory 归属、Git commit 语义基线（本文件不再重复）                         |
| `docs/research/2026-09-23-hermes-agent-memory-architecture.md`（本地，2026-09-23） | MEMORY/USER 双文件、profile=Bot 隔离、单 USER.md（本文件引用不重复）                     |
