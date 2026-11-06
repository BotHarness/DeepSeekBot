# Hermes Agent 记忆架构调研 — NousResearch/hermes-agent（对照 BotHarness）

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题     | Hermes Agent（Nous Research）如何实现跨 Session 记忆：存储形态、写入路径、prompt 注入、Session 检索、Provider 扩展、自动学习与隔离；与 BotHarness 的 Memory/Persona 设计逐轴对照，哪些可借鉴、哪些必须拒绝。                                                                                                                                                                                                                                                                                           |
| 调研日期 | 2026-09-23                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 一手来源 | GitHub 仓库 `NousResearch/hermes-agent`（`main`，MIT）源码与自带文档（`website/docs/**`）；官方文档站 `hermes-agent.nousresearch.com`。第三方 SEO 站（hermes-agent.org 等）未用于任何事实陈述。                                                                                                                                                                                                                                                                                                        |
| 方法边界 | 只用一手来源：逐文件读 `website/docs` Markdown、`agent/memory_manager.py`、`agent/memory_provider.py`、`agent/prompt_builder.py`、`agent/background_review.py`、`hermes_state.py`、`hermes_constants.py`、`plugins/memory/*`、`AGENTS.md`、`pyproject.toml`、`LICENSE`、`README.md`。本机**未安装 Hermes、无 `~/.hermes`**，全部为静态阅读，运行时行为一律「未验证」。所有 URL 访问日期 **2026-09-23**。无法由一手来源确认的说法标「未验证」。**唯写本文件**（未改动其他仓库文件作为本调研的交付物）。 |
| 对照基线 | BotHarness 本地：`GLOSSARY.md`、`docs/adr/`（0002–0061 中与记忆/身份/持久化相关的记录）、`docs/architecture/botharness-architecture.md`、`docs/architecture/bot-runtime-architecture.md`、`docs/research/2026-09-21-letta-memory-persona-git.md`。                                                                                                                                                                                                                                                     |

**一句话结论**：Hermes 的记忆是「**有界双文件快照（MEMORY.md/USER.md，session 冻结注入）+ SQLite FTS5 会话检索 + 单一可插拔外部 Provider + skills 程序性记忆**」四层叠加，一切以 **prompt 缓存稳定性**为最高不变量；BotHarness 则是「**无界 Git Markdown 仓库 + 接受的 Memory Commit 为唯一权威 + system prompt 前缀 append-only（persona 为 session 快照，其余零注入）+ ordinary file tools**」——两边在「文件优先、缓存纪律、写入可控」上同路，在**容量模型、注入策略、权威边界、Provider 可缺席性**上正相反。

---

## 1. Part 1 · Hermes 一手事实

### 1.1 定位与技术栈

Hermes Agent 是 Nous Research 的自改进个人 AI agent：Python 核心（`requires-python = ">=3.11,<3.14"`，版本 `0.21.4`）+ CLI/TUI/Desktop/Electron + 20+ 消息平台 gateway + 插件与 skills 扩展（[pyproject.toml](https://github.com/NousResearch/hermes-agent/blob/main/pyproject.toml)、[README](https://github.com/NousResearch/hermes-agent/blob/main/README.md)、[Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)）。仓库自带 `AGENTS.md` 把两条不变量写死：**per-conversation prompt caching is sacred**（除显式压缩外禁止改动已发出的上下文）与 **core 是窄腰、能力长在边缘**（新能力优先走 CLI/skill/插件而非核心工具面）（[AGENTS.md](https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md)）。许可 **MIT**（[LICENSE](https://github.com/NousResearch/hermes-agent/blob/main/LICENSE)）。

记忆相关代码集中在：`tools/memory_tool.py`（内置 store）、`agent/memory_manager.py` / `agent/memory_provider.py`（Provider 编排与 ABC）、`agent/prompt_builder.py`（system prompt 组装）、`hermes_state.py`（SQLite 会话库）、`plugins/memory/`（外部 Provider 插件）、`agent/background_review.py`（后台学习回路）（[Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)）。

### 1.2 内置持久记忆：MEMORY.md / USER.md（有界、双目标、session 冻结）

内置记忆只有两个文件，存于 `~/.hermes/memories/`：

| 文件        | 用途                                   | 字符上限                   |
| ----------- | -------------------------------------- | -------------------------- |
| `MEMORY.md` | Agent 自己的笔记：环境事实、约定、所学 | **2,200**（约 800 tokens） |
| `USER.md`   | 用户画像：偏好、沟通风格、期望         | **1,375**（约 500 tokens） |

两者在 **session 开始时以 frozen snapshot 注入 system prompt**；Agent 用 `memory` 工具做 add / replace / remove 管理（[Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)、[memory.md 源](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md)）。注入块带 **usage header**（如 `MEMORY (your personal notes) [67% — 1,474/2,200 chars]`）与 **`§` 分隔**的多行条目，让模型始终知道容量（同上）。

关键语义（均为一手）：

- **没有 `read` 动作**——记忆内容已在 system prompt 里，工具只写（[Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)）。
- **容量溢出 = 硬错误，不静默截断**：写入超限时 `memory` 工具返回结构化错误并附 `current_entries` / `usage`，要求模型**在同一 turn 内**用 `replace` 合并或 `remove` 腾位后重试；`replace` 同样受总上限约束（同上）。
- **frozen snapshot**：session 中途的写入立刻落盘，但**不改变当前 session 的 prompt**（保护前缀缓存）；工具返回值显示 live 状态，改动对**下一个** session 生效（同上）。文档明确建议在自然边界 `/new`，否则 gateway 上的长 session 让「遗忘→回忆→检索」学习环几乎不触发（同上）。
- **精确去重**：重复内容返回成功但提示 no duplicate added（同上）。
- **安全扫描**：写入前按注入/外泄/SSH 后门等威胁模式与不可见 Unicode 扫描，命中即拒绝——因为这些字节会进 system prompt（同上）。
- **双 store 开关**：`memory.memory_enabled` / `user_profile_enabled` 可分别关闭；两者全关时 `memory` 工具与 guidance 块一并移除，外部 Provider 不受影响；列在 `agent.disabled_toolsets` 则连外部 Provider 工具一起隐藏（同上）。
- **`write_approval`**：默认自由写；置 `true` 后交互 CLI 内联审批，其它面（gateway、脚本、后台 review）写入被 **staged**，用 `/memory pending` → `/memory approve|reject` 处理；门同时管前台 turn 与后台 self-improvement review（同上）。
- **与 skills 的分工写进 prompt guidance**：「Skills come first」——任务相关的流程/坑/偏好进 skill；memory 只收**与任务无关、每次 session 都成立**的窄事实，且要写成陈述句而非祈使句（[prompt_builder.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/prompt_builder.py) `build_memory_guidance`）。

### 1.3 system prompt 组装：stable → context → volatile，记忆在 volatile

`prompt_builder` 把缓存 system prompt 组成三个有序层（[Prompt Assembly](https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly)）：

1. **stable** — 身份（`SOUL.md` 或 fallback）、工具/模型 guidance、skills index；
2. **context** — 调用方 `system_message`、项目 context files、git workspace 快照、平台提示；
3. **volatile** — skills 索引、**内置记忆快照（`MEMORY.md`）、用户画像快照（`USER.md`）、外部 memory-provider block**、时间戳/模型行、运行环境提示（含 cwd）。

join 顺序 `stable → context → volatile`。要点：记忆与画像属于 volatile 层，**但仍落在被缓存的 system prompt 里**，不是 mid-turn overlay；context 层里共享项目文件排在 worktree 相关行之前，让同项目不同 worktree 共享更长前缀（同上）。`AGENTS.md` 等 context file 有 **5 秒读取超时**（防网络盘卡住首 turn）与 head/tail 截断（70% 头 + 20% 尾 + 中间 marker）（[prompt_builder.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/prompt_builder.py)、[Context Files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)）。

设计原则表把 **Prompt stability** 写成：system prompt 不在会话中变化，除显式 `/model` 等用户动作（[Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)）。

### 1.4 `memory` 工具与写入安全面

`tools/memory_tool.py` 的模块 docstring 直接写明：两文件在 session start 作为 **FROZEN snapshot** 进 system prompt；**mid-session 写盘但永不变 prompt（prefix cache intact）**；单一 `memory` 工具支持 add/replace/remove 或批量 `operations`（[memory_tool.py](https://github.com/NousResearch/hermes-agent/blob/main/tools/memory_tool.py)）。`replace`/`remove` 用 `old_text` **唯一子串**定位条目，多匹配报错要求更精确；`replace` 是**整条覆盖**不是子串替换（[Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)）。

`prompt_builder.build_memory_guidance()` 按开关与 `skill_manage` 是否可用生成 guidance：skills 优先、memory 是「每次 session 都成立的事实」的窄例外、条目写陈述句、过期一周的事实属于 session history 而非 memory（[prompt_builder.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/prompt_builder.py)）。

### 1.5 会话级检索：`session_search` + `state.db`（SQLite FTS5）

除双文件外，Agent 用 `session_search` 检索历史对话：所有 CLI/gateway 会话存于 SQLite（`~/.hermes/state.db`）并建 **FTS5** 全文索引；查询返回**真实消息**（无 LLM 摘要、无截断），支持 discovery / scroll / browse 三种形态，典型延迟 FTS5 查询约 20ms、scroll 约 1ms（[Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)、[Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions)）。

`hermes_state.py` 模块 docstring：SQLite 存会话元数据、消息历史、模型配置、FTS5；**WAL**（多读一写）；**压缩通过 `parent_session_id` 链拆分会话**；会话带 **source 标签**（`'cli'`, `'telegram'`, …）（[hermes_state.py](https://github.com/NousResearch/hermes-agent/blob/main/hermes_state.py)）。session-storage 文档给出表结构要点：`sessions`（含 `source`, `parent_session_id`, `system_prompt_hash`…）、`messages`、`messages_fts`（+ trigram/CJK 变体）、`compression_locks` 等，索引由触发器同步（[Session Storage](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage)）。架构页把 **Session Persistence** 定位为 SQLite + FTS5、按 lineage 跟踪父子（[Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)）。

`session_search` 是 **agent-loop 拦截工具**（与 `memory`/`todo`/`delegate_task` 同级），不经普通 registry dispatch（[Tools Runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)）。prompt guidance：当用户提到过往对话或怀疑有跨会话上下文时，先 `session_search` 再让用户复述（[prompt_builder.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/prompt_builder.py) `SESSION_SEARCH_GUIDANCE`）。

### 1.6 外部 Memory Provider：ABC + 单一外部实例 + 生命周期钩子

`agent/memory_provider.py` docstring 给出权威合同：插件放 `plugins/memory/<name>/`，经 `memory.provider` 激活（**同时只有一个外部 provider**）；**生命周期由 MemoryManager 驱动：initialize → system_prompt_block / prefetch / sync_turn（每 turn）→ tool dispatch → shutdown**，外加可选 `on_*` 钩子（[memory_provider.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_provider.py)）。

`MemoryProvider` ABC 的关键方法与语义（同上）：

- `initialize(session_id, **kwargs)` — 启动时一次；`kwargs` 必含 `hermes_home`（profile 作用域路径，**禁止硬编码 `~/.hermes`**）、`platform`，可能含 `agent_context`（primary/subagent/cron/flush）、`parent_session_id`、`user_id` 等。
- `system_prompt_block()` — **静态** system-prompt 文本；召回内容必须走 `prefetch()` 不进这里。
- `prefetch(query, *, session_id)` — 为即将到来的 turn 返回召回上下文，**必须快**（后台预取回缓存）。
- `queue_prefetch` — 每 turn 后排后台预取，下一 turn 消费。
- `sync_turn(user, assistant, *, session_id, messages, turn_author)` — 持久化已完成 turn，**非阻塞**。
- `get_tool_schemas()` / `handle_tool_call()` — provider 专属工具。
- `shutdown()` — 排队、关连接。
- 可选钩子：`on_turn_start`、`on_session_end`（**仅真实 session 边界**）、`on_session_switch`（`/resume`/`/branch`/`/reset`/`/new`/压缩导致的 session_id 轮换）、`on_pre_compress`（**checkpoint API v2**，`PRE_COMPRESS_CHECKPOINT_API_VERSION = 2`，fail-closed）、`on_delegation`、`on_memory_write`（镜像内置 store 写入）、`get_config_schema`/`save_config`、`backup_paths`、`identity_signature`、`recall_status`。
- **`ctx_bound` / `spawn_context_thread`**：所有 provider 后台任务必须在**调用方 contextvars** 下跑——profile 隔离靠 ContextVar 化的 `HERMES_HOME` 覆盖 + 每 turn secret scope，空 context 的裸线程会写进默认 profile（同上）。

`agent/memory_manager.py` 的编排事实（[memory_manager.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_manager.py)）：

- docstring：**builtin 永远允许；同时只允许一个外部插件 provider**（理由：tool-schema 膨胀、后端冲突）。
- `_EXTERNAL_PREFETCH_TIMEOUT_S = 8.0`（外部预取超时，超时后该 provider 本 turn 跳过、卡住的调用继续在 daemon 线程跑）、`_SYNC_DRAIN_TIMEOUT_S = 5.0`（shutdown 有界排水，daemon worker 保证不挡进程退出）。
- `add_provider`：第二个外部 provider 被拒并 warning；schema 加载先于状态变更；核心工具名保留（`clarify`、`delegate_task` 等）防劫持路由。
- `prefetch_all` 合并所有 provider 上下文；`sync_all` 在**单 worker 后台执行器**上跑（串行化 turn N 先于 N+1，绝不内联阻塞响应）；`queue_prefetch_all` 排下 turn 预取。
- `on_session_end` + `on_session_switch` 经 `commit_session_boundary_async` **串成一个 FIFO 任务**（先抽取再换绑，防 transcript 错配；曾因内联跑抽取卡住 `/new`，因裸线程 race 换绑）。
- `on_pre_compress`：v1 尽力而为 / **v2 checkpoint**（`evidence_messages` + `require_checkpoint` fail-closed；无 provider 完成 checkpoint 时抛错让调用方保留未压缩 transcript）。
- `on_memory_write` / `notify_memory_tool_write`：仅当内置工具**真正提交**（`success === true` 且非 `staged`）才镜像到外部 provider，带上 `old_text` 与 provenance metadata。
- `build_memory_context_block`：把召回内容包进 `<memory-context>` 围栏 + system note（「recalled memory context, NOT new user input… authoritative reference data」），并做 **围栏清洗**（`sanitize_context` 剥 provider 自带标签/system note）与 **`_drop_repeated_recall_lines` 分节去重**（同字节重复 bullet 只留一次，防每 turn 重复付费）。
- `describe_recall()`：确定性召回指示行（`🧠 Provider — recalled N memories`），在 `prefetch_all` 后调用，让**用户**看见用了记忆。
- `memory_provider_tools_enabled`：`agent.disabled_toolsets` 含 `memory` 则不暴露外部工具；`system_prompt_block` 与工具面**同一门**，防 prompt 广告了不存在的工具。

架构页补充：memory provider 与 context engine 是两类 **single-select provider plugin**，经 `hermes plugins` / `config.yaml` 配置（[Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)）。开发者文档给出发现优先级（bundled → user `$HERMES_HOME/plugins/` → project → pip entry point `hermes_agent.memory_providers`，**先到先赢**防 shadow 重定向记忆）与四种来源均「只枚举不 import，直到 `memory.provider` 点名」（[Memory Provider Plugins](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin)）。

### 1.7 内置 Provider 清单与两种 recall 模式

`plugins/memory/` 目录一手清单（[GitHub 目录](https://github.com/NousResearch/hermes-agent/tree/main/plugins/memory)）：**byterover、hindsight、holographic、honcho、mem0、openviking、retaindb、supermemory**（8 个）+ `__init__.py`、`config_schema.py`（声明式 UI 配置 schema，按路径加载不 import 包）、`query_rewrite.py`（把最新用户消息改写成干净检索 query，供任意 provider 复用，`auxiliary.memory_query_rewrite` 配置）。

文档页口径：「Hermes ships with **8 external memory provider plugins**… **Only one** external provider can be active at a time — the built-in memory is **always active alongside it**」（[Memory Providers](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers)）。激活时自动做六件事：注入 provider context、**每 turn 前后台 prefetch**、每响应后 sync turn、session 结束抽取（provider 支持时）、**镜像内置记忆写入**、追加 provider 专属工具（同上）。

Provider 横切能力（同上页）：

- **Honcho**：dialectic 用户建模；两层注入（base：session summary + representation + peer card，按 `contextCadence` 刷新；dialectic：LLM 合成，按 `dialecticCadence`，`dialecticDepth` 1–3 pass）；`recallMode = hybrid | context | tools`。
- **Hindsight**：知识图谱 + 实体消解；`memory_mode = hybrid（context+tools）| context | tools`；`recall_prefetch_method = recall（原始事实）| reflect（LLM 合成）`。
- **Mem0**：`mode = platform | oss` + 自托管 server；服务端 LLM 抽取。
- **Holographic**：本地 SQLite + FTS5 + trust 评分 + HRR 组合检索（零依赖）。
- **OpenViking**（火山引擎）：文件系统式知识层级，L0→L1→L2 分层加载。
- **RetainDB**：Vector+BM25+Rerank 混合检索，7 种记忆类型。
- **ByteRover**：`brv` CLI 知识树，**pre-compression 抽取**（在上下文压缩丢弃前抢救洞见）。
- **Supermemory**：per-turn 捕获、profile 召回、**context fencing**（从捕获内容中剥离已召回记忆防递归污染）、`{identity}` 容器按 profile 隔离。
- **Memori**：文档有条目，但需 `pip install hermes-memori` + entry point（`plugins/memory/memori/` 一手 404）——属 **package 来源**而非 bundled 目录（同上页 + 目录核验）。
- **Profile Isolation**：本地 provider 用 `$HERMES_HOME/` 路径、配置文件 provider 存 `$HERMES_HOME/`、云端 provider 派生 profile 作用域 project 名、env 型走各 profile `.env`（同上）。
- 文档预告 **provider 正迁出主仓、经 plugin catalog 分发**，provider 名与 `memory.<name>` 配置不变（同上）。
- **EverOS：在全部一手源（docs 源、docs 站、`plugins/memory/` 目录、README）中未出现任何提及——标「未验证」（本调研不采信任何二手说法）。**

开发者文档补充合同：`sync_turn()` **必须非阻塞**（用 `spawn_context_thread` 而非裸线程）；存储路径必须用 `initialize()` 注入的 `hermes_home`；prefetch 超阈值会被 spill 到文件防撑爆前缀；测试要覆盖 initialize/tool routing/lifecycle（[Memory Provider Plugins](https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin)）。

### 1.8 Skills = 程序性记忆（progressive disclosure）

Skills 是按需加载的知识文档，兼容 **agentskills.io** 开标准；全部住 `~/.hermes/skills/`，**Agent 可增删改**（[Skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)）。文档原话：`skill_manage` 是 agent 的 **procedural memory**——「when it figures out a non-trivial workflow, it saves the approach as a skill for future reuse」；**「memory stores small durable facts that should always be in context, while skills store longer procedures that should load only when relevant」**（同上）。

token 分级加载（同上）：

```text
Level 0: skills_list()        → name/description/category（约 3k tokens）
Level 1: skill_view(name)     → 全文 + metadata
Level 2: skill_view(name, path) → 指定 reference 文件
```

`SKILL.md` 带 YAML frontmatter（name/description/version/platforms/metadata…）；`skill_manage` 动作 create/patch/delete/write_file/remove_file，patch 优先（token 更省）；写入经 advisory linter（`incident-log-shape`/`references-sprawl`/`oversized-body`，只警告不阻断）。**`skills.write_approval`**：开启后一切 skill 写入 **staged** 到 `~/.hermes/pending/skills/`，`/skills pending|diff|approve|reject` 审查——与 memory 的同名门成对（同上）。`/learn` 把任意来源收成 skill；大语料生成「lean SKILL.md + references/ 分章文件」的知识库型 skill（同上）。Curator 后台维护 agent-created skills：确定性 stale→archive（只归档不删除）+ 可选 LLM consolidation（默认关），pinned/cron 引用的 skill 免疫（[Curator](https://hermes-agent.nousresearch.com/docs/user-guide/features/curator)）。

### 1.9 SOUL.md 与 context files：身份 vs 项目上下文

`SOUL.md` 是 **primary identity，system prompt slot #1**，住 `HERMES_HOME`（默认 `~/.hermes/SOUL.md`）；**只从 HERMES_HOME 读，绝不探测 cwd**；内容经安全扫描与截断后原样注入；空文件则回落内置默认身份；与 context files 不重复出现（[Personality & SOUL.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality)、[Context Files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)）。分工口诀：处处跟随你的放 SOUL.md，属于项目的放 AGENTS.md（[personality.md 源](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/personality.md)）。

context files 优先级：`.hermes.md` → `AGENTS.override.md` → `AGENTS.md` → `CLAUDE.md` → `.cursorrules`（每 session 只取一个项目类），**SOUL.md 恒独立加载为身份**；git 内走 **AGENTS.md 合并链**（git root → cwd，深者靠后，带 provenance header 并去重）；session 中途还有 **progressive subdirectory discovery**（进子目录才注入该目录 `AGENTS.md`，防 system prompt 膨胀、保缓存）；全部经注入扫描，命中即 **BLOCKED**（[Context Files](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)）。`prompt_builder._scan_context_content` 细化：**用户自写的 HERMES_HOME 内 SOUL.md 命中只 WARN 仍加载**（身份文件不该因记录了「ignore previous instructions」这句话而整文件失效），但 profile distribution 带来的 SOUL.md 仍 BLOCKED；项目目录文件（repo AGENTS.md 等）保持 BLOCKED（[prompt_builder.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/prompt_builder.py)）。

### 1.10 后台学习回路、审批门与 Bot/profile 隔离

**Background review**：每 turn 后 `AIAgent.run_conversation` 可 fork 一个 daemon 线程，重放对话快照问「该不该存/改 skill 或 memory」；**写直落 memory+skill store，主对话与 prompt cache 永不受影响**；fork 继承父的 provider/model/credentials/**已缓存 system prompt**（吃同一前缀缓存），跑在 dispatch 侧工具白名单下（[background_review.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/background_review.py)）。配置面（[Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)）：`display.memory_notifications`（off/on/verbose 聊天通知）、`auxiliary.background_review.{provider,model}`（**换便宜模型跑**：不同模型用 compact digest 而非全量重放，省 3–5× 成本；同模型则**永远继承父 reasoning effort**以保字节一致前缀）、`enabled`（关自动 fork，`/refine` 手动仍可）、`max_input_tokens`（单次 review 重放输入预算，默认 75% 窗口上限 600k）、`extra_tools`（白名单，默认空）、`defer`（本地 llama-server 时排队等 GPU 空闲）。与 `write_approval` 联动：后台写入同样被 staged 审查。

**Profile / Bot 隔离**（[Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)、[Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode)）：

- profile = 独立 Hermes home：自己的 `config.yaml`、`.env`、`SOUL.md`、memories、sessions、skills、cron、`state.db`；**严禁两个 agent 进程共用一个 profile/home**（双写会互相污染记忆），共享记忆要走外部 provider。
- `hermes profile create <name>` 即得同名命令；`--clone` 复制 config/`.env`/SOUL/skills/**以及 `memories/MEMORY.md`、`memories/USER.md`**（记忆被视为身份一部分，如 SOUL），sessions/state.db/cron 不复制；`--clone-all` 全量快照但排除 per-profile history 与 cron。
- **Bot Mode：「A Bot is a profile」**——无新原语，Bot 就是 profile（隔离 config/memory/skills/credentials/chat history 于 `~/.hermes/profiles/<name>/`），Bot Mode 只是其上的 roster UI；每个 Bot 有 canonical forever-chat Bot Chat（`/new` 被重路由为 `/compact`）、自定义 SOUL.md、Duplicated Bot 连 **memory** 一起克隆；Routines 是普通 cron jobs 挂 `[bot:<name>]` 前缀。
- **Profile distribution**（git 仓）打包 SOUL/config/skills/cron/MCP/plugins 供他人安装，**收件人的 memories/sessions/keys 保持不动**——「记忆不随分发走，身份与配置随分发走」。
- 架构 Design Principles：**Profile isolation** = 每 profile 自己的 HERMES_HOME/config/memory/sessions/gateway PID，多 profile 可并发（[Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)）。

**checkpoint**（对照用，非对话记忆）：shadow git 仓 `~/.hermes/checkpoints/store/`，opt-in，保护**工作目录**可回滚，与 MEMORY/USER 无关（[Checkpoints](https://hermes-agent.nousresearch.com/docs/user-guide/checkpoints-and-rollback)）。

---

## 2. Part 2 · 逐轴对照（Hermes vs BotHarness）

> 引用约定：Hermes 侧引 URL（访问日期 2026-09-23）；BotHarness 侧引仓库文件路径。BotHarness 的记忆目标态以 **ADR-0047（2026-09-21/22 更新）+ ADR-0060 + living architecture** 为准，历史 ADR 标注 superseded 关系。

### 2.1 存储形态：有界双文件 vs 无界 Git Markdown 仓库

|      | Hermes                                                             | BotHarness                                                                                               |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 形态 | `MEMORY.md` + `USER.md` 两个**有界**文本文件（2,200 / 1,375 字符） | 每 PersonaBot 一个 **Memory Repository（Git 仓）**，**所有文档是普通 Markdown，无生成/特权 `MEMORY.md`** |
| 容量 | 硬上限，溢出报错逼模型同 turn 合并                                 | 无字符预算概念；prompt 侧不注入正文（见 2.4）                                                            |
| 版本 | 无内建版本；靠条目级 replace                                       | **Git history = durable authority**；accepted **Memory Commit** 才生效                                   |

- Hermes：[Persistent Memory](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)。
- BotHarness：`GLOSSARY.md`（Memory / Memory Repository / Memory Commit 词条）；`docs/adr/0047-memory-is-an-optional-git-backed-service.md`（「All Memory documents are ordinary Markdown. There is no generated or privileged `MEMORY.md`」；v1 每 PersonaBot 一仓、Orchestrator `cwd` 即仓库根）；`docs/adr/0002-file-first-self-built-bot-memory.md`（file-first 方向，被 0047 refine）。

**对照**：Hermes 用**容量墙**换 prompt 可预算与 curated 质量；BotHarness 用**无界仓库 + 接受边界**换人类可读、可 grep、可迁移的全量知识。两边都拒绝 SQLite/向量库作为记忆权威（Hermes 明确内置 store 是文件；BotHarness ADR-0002 拒 SQLite 存记忆、ADR-0005→0037/0041 只把 SQLite 用于 operational state 且 Soul/Memory 文件在其外）。

### 2.2 写入路径：专用 `memory` CRUD 工具 vs ordinary file tools + Service 提交

- **Hermes**：模型通过**专用 `memory` 工具**（add/replace/remove，子串定位）写双文件；另有 8+ 外部 provider 的专属工具；`memory`/`session_search` 是 agent-loop 拦截工具（[memory.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)、[Tools Runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)）。写入过安全扫描、去重、`write_approval` 门。
- **BotHarness**：v1 **不给模型 `memory_read/write/pin/unpin` 之类专用工具**——Agent 用**普通 filesystem / Shell / `grep` / `git`** 在仓库根探索与修改；变更经 **Memory Service**（validation、reconciliation、accepted commit、history、query），working-tree 改动只是 provisional，**raw Git commit 经 reconciliation 接受后才成为 Memory Commit**（`docs/adr/0047-…md` Update 2026-09-21；`docs/architecture/bot-runtime-architecture.md` §Optional Memory capability；`GLOSSARY.md` Memory Commit/Reconciliation 词条）。历史 ADR-0003「tool-driven only」已被 0047 superseded（mutation 可来自 Tools、Human UI、trusted Plugins，但都必须过 Service）。
- 共同点：都**拒绝无监督自动写入当权威**——Hermes 用 `write_approval` + 扫描 + 去重；BotHarness 用 reconciliation + actor/cause 归属 + Cordis before/after 事件（metadata only，`docs/architecture/bot-runtime-architecture.md`）。

### 2.3 system prompt 注入：session 冻结快照（记忆+画像进 volatile） vs append-only 前缀（记忆零注入）

这是**最根本的分歧**：

- **Hermes**：session 开始把 `MEMORY.md`+`USER.md` **整块冻结注入** volatile 层；中途写盘不改 prompt；外部 provider 的召回走 `prefetch`（进上下文）+ 静态 `system_prompt_block`；skills index 进 stable 层。一切服务 **prefix cache**（[Prompt Assembly](https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly)、[memory.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)）。
- **BotHarness ADR-0060**：**system prompt 前缀 append-only**——整 session 字节不变；只有静态 role/rule 文本 + **该 session 冻结的 persona 快照**进前缀；**没有 Memory Tree、没有生成 `MEMORY.md`、没有 pin 预算/全文注入**；记忆内容只能作为 **tool result 追加到会话底部**；Agent 被告知仓库位置后**自行用文件工具探索**。成本论证与 Hermes 同源（改前缀 = 作废缓存、后续每 turn 全价），但推论相反：**Hermes 结论是「把记忆冻结进前缀」，BotHarness 结论是「记忆根本不进前缀」**（`docs/adr/0060-system-prompt-prefix-is-append-only.md`）。
- Persona/身份：Hermes `SOUL.md` = slot #1 全局身份（稳定层，session 内稳定）；BotHarness **Persona = 普通 Memory 内容**（约定名 `persona.md`），在 **Session 首次 prompt 组装时冻结成 persona snapshot** 存 `session_ownership.persona_snapshot`，Human 编辑只影响尚未快照的 session（`GLOSSARY.md` Persona 词条；`docs/adr/0047-…md` Update 2026-09-22；`docs/adr/0060-…md` §persona snapshot）。身份权威在 Host-owned PersonaBot ID，不在文件（`GLOSSARY.md`）。
- 历史：ADR-0004「每 turn 注入 memory tree」被 0047→**0060 完全废除**——与 Hermes「记忆整块进 volatile」正相反，BotHarness 走到了「零派生态进前缀」。

### 2.4 容量与预算模型

- Hermes：**字符墙**（2,200+1,375）+ usage header + 溢出报错 + 同 turn 合并 + 「80% 就先合并」最佳实践（[memory.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)）。
- BotHarness：prompt 侧无记忆预算（因为不注入）；曾有的 pin budget 已被 0060 移除（`docs/adr/0047-…md` 两次 Update、`docs/adr/0060-…md` Rejected alternatives）。front-matter 保留 `summary/updated_at/sources/tags`（ADR-0012，`visibility` 字段已按 ADR-0021 删除），但 **pin 元数据不再被 prompt 组装消费**（ADR-0060 Consequences）。
- 含义：Hermes 的预算压力落在 **模型的整理义务**（curate/consolidate）；BotHarness 的预算压力落在 **探索时机**（agent 何时去读文件），不落在存储。

### 2.5 权威边界：文件落盘即权威 vs 接受的 Commit 才权威

- Hermes：`memory` 工具成功写盘即生效（下 session 可见）；`staged`（待审批）不算提交、不镜像给 provider（`memory_manager.notify_memory_tool_write` 的 fail-closed 判定，[memory_manager.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_manager.py)）。会话内容权威在 `state.db`（WAL SQLite）。
- BotHarness：**Memory Commit（经 reconciliation 接受的 Git commit）才是 durable product boundary**；未提交 working-tree 改动不改变 frozen persona、历史投影或 Memory 事件（`GLOSSARY.md`；`docs/adr/0047-…md`）。operational 权威在 `$DSH_HOME/botharness/botharness.db`（ADR-0041），**Soul/Memory 文件、附件字节、DSH Session log、凭证都在库外**，库只存引用不复制内容（ADR-0041、ADR-0037）。Cordis `memory/after-operation` 只在 durable commit 成功后报 commit id，事件是可重建投影不是第二权威（`docs/architecture/bot-runtime-architecture.md`）。
- 对照：Hermes 的「提交」是**工具调用成功**；BotHarness 的「提交」是**跨验证的语义 commit**。后者更接近数据库事务语义，前者更接近编辑器自动保存。

### 2.6 会话/历史检索

- Hermes：一等能力——`session_search`（FTS5，三种调用形态，无 LLM），与内置记忆明确分工表（记忆=常驻关键事实，session search=「上周聊过 X 吗」）（[memory.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)、[sessions.md](https://hermes-agent.nousresearch.com/docs/user-guide/sessions)）。`state.db` 同时是会话持久层（WAL、parent_session_id 压缩链、source 标签）。
- BotHarness：**DSH SessionPersistence 是执行权威**（tool call/assistant output），**不是对话权威**；Channel/消息对话权威走 ADR-0037 的 SQLite 事务（Source Event），历史曾是 per-Channel NDJSON（ADR-0030，已 superseded）；Memory 侧**没有内建全文检索工具**——Agent 用普通 `grep`/文件工具在仓库搜（ADR-0060 第 3 条；`docs/architecture/botharness-architecture.md`）。检索产品面（`memory_search` 类 bridge 方法）在 `docs/client-bridge.md` 仍列为待定（「记忆编辑走同一桥还是仅会话内 `memory_*` 工具」——该文早于 0047/0060 的工具移除，以 ADR 为准）。
- 含义：Hermes 把「回忆」做成**平台工具**；BotHarness 把「回忆」做成**agent 已有的文件工具 + 人类可 grep 的仓库**，避免第二套检索语义。

### 2.7 能力 seam：内置+单一外部 Provider（恒在） vs Consumer→Service Definition→Provider（可缺席）

- Hermes：**builtin 永远在**，外部 provider **同时至多一个**，叠加运行（add/replace/remove 镜像给外部；prefetch/sync 并行）；single-select 是 plugin 类型级约束（[memory-providers.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers)、[memory_manager.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_manager.py)、[Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)）。
- BotHarness：application-defined **`Consumer → Service Definition → Provider`** capability seam；Consumer 含 Bot Runtime、Orchestrator、Assignment Runtime、Client、其他 trusted Plugin；**Provider 可缺席**时——不注册 Memory Tool、不注入 Memory context、Client 不显示 Memory destination，**DM→Orchestrator→Assignment 主链照常**（`docs/architecture/bot-runtime-architecture.md`；`docs/architecture/botharness-architecture.md`；`docs/adr/0047-…md` 原始决定）。注意 0047 Update（2026-09-21）把「创建时 Provider 缺席」收紧为 **fail-closed**（v1 每 PersonaBot 必有一仓，创建失败即失败），但 seam 结构与「能力可检测、缺席不炸主链」的 Consumer 语义保留；运行时禁用 Provider 验证主链仍通仍是 tracer bullet 要求（`docs/architecture/botharness-architecture.md` §8、`docs/research/2026-09-21-letta-memory-persona-git.md` §3/§6）。
- 对照：Hermes 的单例约束是**防工具面膨胀与后端冲突**（实现卫生）；BotHarness 的 seam 是**产品能力边界**（记忆不是聊天前置）。两者都拒绝「多外部记忆后端并存」——Hermes 显式禁止，BotHarness 未设计多 Provider 并存。

### 2.8 身份模型：SOUL.md（实例身份） vs PersonaBot Host 身份 + Persona（记忆内容）

- Hermes：身份= `HERMES_HOME/SOUL.md`（slot #1，安全扫描+截断，仅从 home 读）+ 可选 `/personality` 会话覆盖；Bot=profile，身份随 profile 走（[personality.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality)、[Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode)）。
- BotHarness：身份= **Host-owned PersonaBot ID**（filesystem-safe、Human 不输入，`GLOSSARY.md`）；**Persona 是 Memory 里可选的普通内容**，无特殊文件类型、无写保护（曾有的 human-only 写保护被 ADR-0047 superseded，原 ADR-0014），经 session 快照进 prompt；`PERSONA.md`/`persona.md` 可被有权限的 Agent 或 Human 改名/删除（`GLOSSARY.md`、`docs/adr/0014-…md` superseded 注记、`docs/adr/0047-…md`）。
- 对照：两边都把「人格文件」与「持久事实记忆」**分开放**（Hermes: SOUL vs MEMORY/USER；BotHarness: persona.md vs 其余 topic files），但 Hermes 的身份绑在 **profile/home**，BotHarness 的身份绑在 **Host 实体**且明说「Bot as a Person：连续性来自 Memory Repository 而非 session history」（`GLOSSARY.md`）。

### 2.9 程序性记忆与自动学习

- Hermes：**skills 就是程序性记忆**（progressive disclosure、`skill_manage`、curator 归档）+ **background review** 每 turn 后 fork 抽取（memory+skill 双写）+ `write_approval` 双门（memory 与 skills 各一）+ `/journey` 学习时间线可编辑/删除（[skills.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)、[memory.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)、[background_review.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/background_review.py)）。
- BotHarness：**不做后台自动蒸馏当权威**——历史 ADR-0003 明确拒自动 distillation（prompt 注入可污染记忆），虽被 0047 superseded，但当前形态仍是**显式操作 + reconciliation**；skills 侧本仓已是一等公民（`.agents/skills/`、`skills-lock.json`、`dsh-plugin-dev` 等），与 Hermes skills 形态同源（agentskills.io 兼容）；Memory guidance 同样是「先 skill 后 memory」（BotHarness 无 Hermes 那段 prompt，但 tracer bullet 与 ADR-0045「Assignment 报告值得记忆的发现、不写仓库」体现同类分工：Orchestrator 记、Assignment 报，`CHANGELOG.md` #115 条目）。
- 对照：Hermes 的自动学习是**产品核心卖点**（self-improving loop，README 原话），审批门是其安全阀；BotHarness 把自动学习放在**可选后台 review 的镜像位**（未来若引入须继承 write_approval 语义），当前 v1 主张 Human/Agent 显式写 + Git 可审计。

### 2.10 隔离与多实例

- Hermes：**profile = 隔离单元**（HERMES_HOME 级：config/密钥/SOUL/memory/sessions/skills/state.db），单进程内靠 ContextVar `HERMES_HOME` 覆盖 + `ctx_bound` 线程绑定防串写；多 gateway 可 multiplex 但 profile 状态互不可见（[Profiles](https://hermes-agent.nousresearch.com/docs/user-guide/profiles)、[memory_provider.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_provider.py)、[Multiplexing Gateway](https://hermes-agent.nousresearch.com/docs/developer-guide/multiplexing-gateway)）。
- BotHarness：**PersonaBot = 隔离与连续性单元**（一仓、一 Orchestrator、多 Assignment），profile 级另有 **Profile Writer Lease**（OS 级单写者，第二 Host 得 `profile-in-use` 只读诊断）与单一 `botharness.db` Schema Generation（ADR-0041）；Memory 与 operational DB 分离，备份/导出边界见 ADR-0040/0042、`docs/architecture/botharness-architecture.md` §6。
- 对照：Hermes 防的是「两个进程写坏一份记忆」（文档反复警告 one agent per home）；BotHarness 防的是「两个 Host 写坏一份 operational state + 记忆归属漂移」（lease + session ownership + reconciliation）。**Hermes 没有「跨 profile 共享记忆」的内建路径**（明确引导去外部 provider）；BotHarness 没有「跨 PersonaBot 共享记忆」的 v1 路径（ADR-0021 拒 per-entry visibility 与 per-user 记忆，保 Bot as a Person）。

### 2.11 检索/写入安全与可观测

- Hermes：记忆写入威胁扫描、context file 注入扫描（项目 BLOCK / 用户 SOUL WARN）、`<memory-context>` 围栏 + system note 防把召回当用户输入、`describe_recall` 可见召回、去重防重复付费、`write_approval`/`skills.write_approval` staged 队列、危险命令审批独立成层（[memory.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory)、[context-files.md](https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files)、[memory_manager.py](https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_manager.py)、[Security](https://hermes-agent.nousresearch.com/docs/user-guide/security)）。
- BotHarness：**零秘密进记忆/配置**（Feishu App Secret 只进 DSH credentials service，ADR-0006 文件名 `0006-feishu-secrets-in-dsh-credentials-service.md`；`GLOSSARY.md` Credential reference 词条）；Memory Service 操作要求 repository id/actor/cause（ADR-0047）；事件不带文件体；导出时才决定哪些记忆外流（ADR-0021，**无 entry 级 visibility**，supersede ADR-0013）；Session ownership 显式化（ADR-0035→0041/0045 语境）。
- 对照：Hermes 的威胁模型偏 **prompt 注入/外泄**（记忆会进 system prompt）；BotHarness 的威胁模型偏 **归属与外发边界**（记忆不进 prompt，但会进导出/共享）。ADR-0021 的「记忆无 visibility、共享只在导出时决定」与 Hermes「记忆全进同一 system prompt、无分面过滤」在**「一个 Bot 一个脑子、不分场景藏事实」**上结论一致（Hermes 甚至没有 visibility 概念；BotHarness 是先做了 ADR-0013 再主动删掉）。

---

## 3. Part 3 · 对 BotHarness 的启发（评估性判断，非事实陈述）

以下各条是**本调研的评价**，不是 Hermes 或 BotHarness 文档的原话；落地前应回到对应 ADR/issue 验证。

1. **缓存纪律互相印证，但策略分叉要守住**：Hermes（frozen snapshot 进 volatile）与 BotHarness ADR-0060（append-only、零记忆注入）都为 prefix cache 负责；BotHarness **不应**因「Hermes 也注入记忆」而回退 0060——0060 已显式否决 Memory Tree/生成索引/pin 注入，回退即作废其成本论证。Hermes 证明的是「注入就必须冻结」，不是「必须注入」。
2. **「有界 + 同 turn 合并 + usage header」是可借鉴的运维模式**，但应放在**哪里**需谨慎：BotHarness 无 prompt 记忆预算，容量墙无处安放；若未来引入「会话级 scratch 摘要」或 persona 快照上限，可借 Hermes 的**溢出报错 + 模型自合并 + header 可见性**三件套，而不是引入全局 MEMORY.md 字符墙。
3. **单一外部 Provider + builtin 永远在 + 工具面/prompt 面同门**（`memory_provider_tools_exposed` 与 `system_prompt_block` 同 gating）值得抄进 BotHarness 的 capability detection：**Consumer 侧「Provider 缺席 ⇒ 工具、context、UI 同时缺席」**要一处判定，防半开状态（Hermes 注释里 `#81014` 就是半开事故）。
4. **`ctx_bound` / profile contextvars 的教训直接适用于 DSH 多 profile**：任何 Memory Service 后台线程必须绑定调用方的 profile/HOME 上下文，否则会串写——与本仓 `dsh-dev` skill 的 profile 隔离要求同构，应在 Memory tracer bullet 的测试里显式覆盖「两个 profile 并发写不串」。
5. **写入审批门（`write_approval` → staged 队列）是自动学习回路的前置件**：若 BotHarness 未来引入后台 review/蒸馏，必须先有 staged + actor/cause + 可拒绝路径，否则违背 ADR-0003 遗留的「防注入污染」精神与 ADR-0047 的 commit 语义；Hermes 已给出 staged 文件位置（`~/.hermes/pending/`）与 `/pending|/approve|/reject` 交互形状。
6. **`session_search` vs 记忆的分工表**（常驻事实 vs 按需历史）提示：BotHarness 的「回忆」若将来要产品化，优先做成 **Channel/事项 UI 的投影 + agent 已有 grep**，而不是再造一个模型可调的 FTS 工具——DSH SessionPersistence 已有执行历史，再造检索易与「session history ≠ 对话权威」的既有边界冲突（ADR-0030/0037 语境）。
7. **Profile distribution「配置/身份随分发走、记忆不走」与 SoulSnapshot「记忆可选进包」是两种共享哲学**：Hermes 分发不含记忆（收件人保留自己的）；BotHarness SoulSnapshot 允许**显式选择**记忆与 git ref 进包（ADR-0020/0040/`GLOSSARY.md` Export 词条）。后者是差异点（同 `docs/research/2026-09-18-lobehub-agent-profiles.md` §10.3 对 LobeHub 的结论），应继续作为对外叙事，不因 Hermes 模式而收缩。
8. **skills 同源、可直接对齐**：Hermes 的 agentskills.io 兼容、progressive disclosure、`skill_manage` + `write_approval` + curator 归档，与本仓 `.agents/skills`/`skills-lock.json`/`dsh-plugin-dev` release train 是同一物种；Hermes 的 **linter 警告（incident-log-shape 等）与 pinned/cron 引用免疫归档**可平移到 BotHarness 的 skill 维护讨论，不涉及 Memory ADR。

**明确拒绝**：把 Hermes 的 `MEMORY.md`/`USER.md` 双文件、字符墙、或「记忆整块注入 volatile」搬进 BotHarness——与 ADR-0002/0047/0060、`GLOSSARY.md` Memory 词条及 living architecture 的 file-first + append-only + 零派生态注入直接冲突；EverOS 等二手提及在核实前不进入任何结论。

---

## 4. 一手来源与访问日期

Hermes（访问日期均为 **2026-09-23**）：

| 来源                                                                                                                                                                              | 支撑内容                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| <https://github.com/NousResearch/hermes-agent>                                                                                                                                    | 仓库、README、许可入口                                                                             |
| <https://github.com/NousResearch/hermes-agent/blob/main/LICENSE>                                                                                                                  | MIT                                                                                                |
| <https://github.com/NousResearch/hermes-agent/blob/main/pyproject.toml>                                                                                                           | 版本 0.21.4、requires-python、依赖钉死策略                                                         |
| <https://github.com/NousResearch/hermes-agent/blob/main/AGENTS.md>                                                                                                                | prompt-cache sacred、窄腰架构、贡献边界                                                            |
| <https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_manager.py>                                                                                                  | 单外部 provider、超时常量、prefetch/sync/session 钤子、镜像门控、`<memory-context>` 围栏与去重     |
| <https://github.com/NousResearch/hermes-agent/blob/main/agent/memory_provider.py>                                                                                                 | ABC 生命周期、`ctx_bound`/`spawn_context_thread`、checkpoint v2、`hermes_home` 注入要求            |
| <https://github.com/NousResearch/hermes-agent/blob/main/agent/prompt_builder.py>                                                                                                  | 三层 prompt、memory/skill guidance、context 扫描与 5s 超时、SOUL user_authored WARN                |
| <https://github.com/NousResearch/hermes-agent/blob/main/agent/background_review.py>                                                                                               | 后台 fork 学习回路、缓存继承、取消/预算                                                            |
| <https://github.com/NousResearch/hermes-agent/blob/main/hermes_state.py>                                                                                                          | SQLite/WAL/FTS5、parent_session_id 压缩链、source 标签、state.db                                   |
| <https://github.com/NousResearch/hermes-agent/blob/main/hermes_constants.py>                                                                                                      | HERMES_HOME 解析、profile 标记                                                                     |
| <https://github.com/NousResearch/hermes-agent/blob/main/tools/memory_tool.py>                                                                                                     | 双 store frozen snapshot、单一工具契约                                                             |
| <https://github.com/NousResearch/hermes-agent/tree/main/plugins/memory>                                                                                                           | 8 个 bundled provider 目录 + config_schema.py + query_rewrite.py（memori 目录 404 → package 来源） |
| <https://github.com/NousResearch/hermes-agent/blob/main/plugins/memory/{hindsight,honcho,holographic,mem0,openviking,retaindb,supermemory,byterover}/README.md>                   | 各 provider 配置与工具                                                                             |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory.md>                                                                               | 双文件、容量、frozen、去重、扫描、write_approval、session_search 对照、journey、后台 review        |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/memory-providers.md>                                                                     | 8 provider、六步生命周期、recallMode/memory_mode、profile isolation、catalog 迁移                  |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/architecture.md>                                                                             | 子系统图、single-select、Design Principles                                                         |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/skills.md>                                                                               | skills=procedural memory、L0/L1/L2、write_approval、learn/curator                                  |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/context-files.md>                                                                        | context 优先级、AGENTS 链、progressive discovery、SOUL 仅 home、扫描                               |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/personality.md>                                                                          | SOUL slot #1、prompt stack                                                                         |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/bot-mode.md>                                                                                      | Bot=profile、forever-chat、clone 含 memory                                                         |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/profiles.md>                                                                                      | profile 隔离、clone/clone-all 记忆语义                                                             |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/sessions.md>                                                                                      | state.db/FTS5、session_search 三形态                                                               |
| <https://github.com/NousResearch/hermes-agent/blob/main/website/docs/developer-guide/{prompt-assembly,session-storage,memory-provider-plugin,context-compression-and-caching}.md> | 三层 prompt、表结构、Provider 合同、缓存交互                                                       |
| <https://hermes-agent.nousresearch.com/docs/user-guide/features/memory>                                                                                                           | 同 memory.md 的站点版（访问 2026-09-23）                                                           |
| <https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers>                                                                                                 | 同 memory-providers.md 的站点版                                                                    |
| <https://hermes-agent.nousresearch.com/docs/user-guide/features/skills>                                                                                                           | skills 站点版                                                                                      |
| <https://hermes-agent.nousresearch.com/docs/user-guide/features/context-files>                                                                                                    | context files 站点版                                                                               |
| <https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode>                                                                                                                  | Bot Mode 站点版                                                                                    |
| <https://hermes-agent.nousresearch.com/docs/user-guide/features/personality>                                                                                                      | personality 站点版                                                                                 |
| <https://hermes-agent.nousresearch.com/docs/user-guide/sessions>                                                                                                                  | sessions 站点版                                                                                    |
| <https://hermes-agent.nousresearch.com/docs/user-guide/profiles>                                                                                                                  | profiles 站点版                                                                                    |
| <https://hermes-agent.nousresearch.com/docs/developer-guide/architecture>                                                                                                         | architecture 站点版                                                                                |
| <https://hermes-agent.nousresearch.com/docs/developer-guide/memory-provider-plugin>                                                                                               | Provider 插件开发站点版                                                                            |
| <https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage>                                                                                                      | 会话存储站点版                                                                                     |
| <https://hermes-agent.nousresearch.com/docs/developer-guide/prompt-assembly>                                                                                                      | prompt 组装站点版                                                                                  |
| <https://hermes-agent.nousresearch.com/docs/developer-guide/context-compression-and-caching>                                                                                      | 压缩/缓存站点版                                                                                    |
| <https://hermes-agent.nousresearch.com/docs/user-guide/features/honcho>                                                                                                           | Honcho 独立页（recallMode 等）                                                                     |
| <https://hermes-agent.nousresearch.com/docs/user-guide/configuration>                                                                                                             | config.yaml 记忆/审批键                                                                            |
| <https://hermes-agent.nousresearch.com/docs/user-guide/security>                                                                                                                  | 审批与扫描分层                                                                                     |
| <https://hermes-agent.nousresearch.com/docs/user-guide/checkpoints-and-rollback>                                                                                                  | shadow git（非对话记忆）                                                                           |
| <https://hermes-agent.nousresearch.com/docs/user-guide/features/curator>                                                                                                          | skill 归档/consolidation                                                                           |
| <https://hermes-agent.nousresearch.com/docs/reference/cli-commands>                                                                                                               | `hermes memory`/`journey`/`prompt-size` 等 CLI                                                     |
| <https://hermes-agent.nousresearch.com/docs/developer-guide/plugins>（及 user-guide/features/plugins）                                                                            | provider plugin 类型约束                                                                           |
| <https://hermes-agent.nousresearch.com/docs/getting-started/quickstart>                                                                                                           | Blank Slate/最小 agent 与 memory 可关                                                              |

BotHarness（本地文件，对照用）：`GLOSSARY.md`；`docs/adr/0002-file-first-self-built-bot-memory.md`、`0003-memory-writes-are-tool-driven.md`、`0004-inject-memory-tree-retrieve-on-demand.md`、`0005-sqlite-is-an-optional-index.md`、`0006-feishu-secrets-in-dsh-credentials-service.md`、`0012-adopt-yaml-front-matter.md`、`0013-memory-visibility.md`、`0014-persona-is-human-owned-memory.md`、`0020-soul-snapshot-is-content-addressed.md`、`0021-memory-has-no-visibility.md`、`0030-channel-history-is-append-only-files.md`、`0037-messaging-facts-share-one-sqlite-transaction.md`、`0040-personabot-export-wraps-soul-and-optional-operational-facets.md`、`0041-one-database-owns-botharness-operational-state.md`、`0047-memory-is-an-optional-git-backed-service.md`、`0060-system-prompt-prefix-is-append-only.md`；`docs/architecture/botharness-architecture.md`、`docs/architecture/bot-runtime-architecture.md`；`CHANGELOG.md`（#115 记忆落地条目）；`docs/research/2026-09-21-letta-memory-persona-git.md`、`docs/research/2026-09-18-lobehub-agent-profiles.md`（同系列体例）。

**未验证清单**：① EverOS 在 Hermes 一手源中的存在性（零命中）；② 一切运行时行为（本机无 `~/.hermes`，未安装/运行 Hermes）；③ 二手站点关于「Hermes 与 X 集成」的说法（未采信）；④ Memori 作为 entry-point provider 的实际注册行为（仅确认文档要求 `pip install hermes-memori` 且 bundled 目录不存在）；⑤ Hermes 未文档化的内部配置键（如是否有通用 `recall_prefetch_method` 之外的全局预取开关——一手仅见 Hindsight 的 `recall_prefetch_method` 与 Honcho 的 `recallMode`）。
