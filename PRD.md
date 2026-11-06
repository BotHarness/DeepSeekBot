# DeepSeekBot — 产品需求文档（PRD）

> **历史工作草稿，不再是设计权威，也不发布到文档站。** 当前产品术语以 `GLOSSARY.md` 为准，整合后的目标架构以 `docs/architecture/botharness-architecture.md` 为准，取舍与理由以 `docs/adr/` 为准。

| 项        | 内容                                                                                                                                                                                                                                    |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本      | v1.8（PoC）                                                                                                                                                                                                                             |
| 日期      | 2026-09-20                                                                                                                                                                                                                              |
| 状态      | Archived working draft                                                                                                                                                                                                                  |
| 形态      | **BotHarness 的首个应用**：DSH 插件 bundle                                                                                                                                                                                              |
| 平台规格  | `docs/botharness.md`（PersonaBot / 记忆 / 状态 / 工作方式）                                                                                                                                                                             |
| 上游依赖  | DSH（开发者预览，**必须 pin**）；dsh-im（通道基座）；blobatar（MVP 形象）                                                                                                                                                               |
| v1.0 变更 | 重组：平台层（PersonaBot、记忆、状态、工作方式）移入 `docs/botharness.md`，本 PRD 只描述 DeepSeekBot 应用；路线从 IM-first 调整为 **sidebar-first**（IM 作为第一个真实渠道，见 M5）；仓库更名 `BotHarness/BotHarness`                   |
| v1.1 变更 | 对齐平台 v1.6（ADR-0024/0025/0026）：US-2/AC-2.2 委派目标态 = 独立工作 Session；术语对齐 `GLOSSARY.md`（Channel / Binding / Inbox / Orchestrator Session）；跨 PersonaBot 通信目标路径 = 经 Orchestrator                                 |
| v1.2 变更 | 对齐平台 v1.7：PersonaBot 最小 profile = displayName / tag（岗位）/ description，AC-1.3 向导同步；模型选择为本地策略、不随 SoulSnapshot 发布（ADR-0027）                                                                                |
| v1.3 变更 | 对齐平台 v1.9（ADR-0029/0030 + 0026 增补）：BOT 模式改为聊天优先（点击 BOT 即 DM，session 移右侧面板，workspace 弱化）；Channel/Section/Bridge/Bot Inbox 术语；M3 收敛为 IA + 聊天外壳 + 本地消息存储，Bot Inbox 及 Channel 工具落 v1.1 |
| v1.4 变更 | 对齐平台 v1.10（ADR-0031/0032）：sidebar 区块排序与移动、未分组、默认 blobatar 头像与字形图标、行几何对齐原生实测；自定义头像与头像动效/表情留 v1.1                                                                                     |
| v1.5 变更 | 对齐平台 v1.12（#71、ADR-0035–0045）：explicit Session ownership、Source Event/Inbox/Outbox、Orchestrator 管理 independent Assignment Sessions、全局并发上限、provider capability/grant、单文件手动 profile backup                      |
| v1.6 变更 | 对齐平台 v1.15（#56、ADR-0031/0034）：section 整块可接收归属投放；拖拽不改变 target layout，源行原位淡出；未分组改为可夹在 section 间的松散 Channel，并由当前 Host roster 的 `topOrder` 持久化                                          |
| v1.7 变更 | 对齐 ADR-0046：PersonaBot ID 由 Host 生成且不暴露为创建字段；名称是列表和 `@` picker 的可见标签（token 仍绑定 ID，同名允许）；单一 tag 改为 0～多个岗位徽章；最小表单收名称、可选岗位徽章与可选简介                                     |
| v1.8 变更 | 对齐 ADR-0029/0017/0024/0045 更新：DM 右侧改为 Chat、Memory 与 subordinate `事项` 列表；Orchestrator 不列出；Work/Worker 全面收敛为 Assignment / Assignment Session / Assignment Agent，避免语音与输入歧义                              |

## 0. 历史变更（v0.2–v0.9）

- **v0.9**：独立 DSH 插件（不 fork dsh-im）；记忆引入 front-matter、`PERSONA.md` 人属、`visibility`、附件引用即提升、git 每 turn 一 commit；M1 只验 Lark 国际版。
- **v0.8**：GitHub 远端 + GitHub Issues；建立 `GLOSSARY.md` 与 ADR。
- **v0.7**：回复位置默认 thread 优先；上游共建延后。
- **v0.6**：不引入 front-matter（v0.9 反转）；目录树注入上限 1000 路径；工具链初始化。
- **v0.5**：工具写、目录树注入、git 版本化方向、入站文件必须可用。
- **v0.4**：文件优先记忆；SQLite 降级；凭据进 DSH credentials；「Bot 即人」。
- **v0.3**：不用 celld；记忆自研；单 Host 形态。
- **v0.2**：长连接出站；插件内配置 UI 为 P0。

## 1. 是什么

**DeepSeekBot** 把 BotHarness 的 PersonaBot 带进 DSH 界面：在 sidebar 里创建、观察、@委派，让它们持续工作；并通过适配器接入 IM（飞书 / Lark），把"群里的同事"落到真实场景。

- 平台能力（实体、记忆、状态、工作方式）见 `docs/botharness.md`，本 PRD 不重复。
- 非目标：平台内核、Live2D（独立 effort）、多 IM 渠道（先飞书）、多工作站。

## 2. 用户故事与验收

### US-1 Roster 与创建（P0）

> 作为用户，我在 DSH 里看到所有 PersonaBot——形象（blobatar）、状态、工作树；能创建/删除/编辑。

- AC-1.1 bot-mode sidebar 平铺列表：头像 + 聚合状态（六态）+ 未读点；头像为 Host-owned PersonaBot ID 确定性生成的默认 blobatar（DM 行显示 Bot 头像，群 Channel 行用字形），行几何对齐原生实测（ADR-0031/0032）；置顶区仅 BOT。
- AC-1.2 点击 BOT 打开 DM 聊天（IM 样式，本地消息）；BOT 与 Channel（群聊）同列；用户可建可折叠 Channel section 组织 Channel，section 可手排。Channel 可拖到 section 头/体归属该 section，也可拖到 section 边界间隙成为松散 Channel，直接位于两个 section 之间；「未分组」仅表示无 section membership，不再显示固定底部 bucket/header。
- AC-1.3 创建：首次无 BOT 的空状态按钮和此后「+」菜单都可打开最小表单；Human 填写名称，并可选填写 0～多个岗位/职位徽章与简短简介，Host 自动生成不可见 PersonaBot ID 并写入占位 `PERSONA.md`。名称是未来 `@` picker 的可见标签，token 保留内部 ID，同名允许并用头像/徽章消歧。Builder 对话创建与更完整 profile 编辑后续按需进入。
- AC-1.4 PersonaBot DM 的右侧 navigation 以 Chat、Memory 为主入口，并在其下直接平铺该 Bot 的 `事项` 列表；Orchestrator Session 不显示为事项。点击事项进入只读详情，原始 DSH Session 仅通过显式次级操作打开；group Channel 不显示此导航。sidebar 折叠为 rail 时显示全部可见 PersonaBot 头像与 Channel icon，hover/focus 显示名称，点击只切换目标、不自动展开。
- AC-1.5 排序：每个 section 的排序方式为 `updated` / `manual` / `inherit`（默认 `inherit`）；全局默认在 Bots 头部 `...` 菜单设置；首次手动拖拽或拖入 section 切 `manual` 并冻结当前顺序，「恢复自动」回 `inherit`。松散 Channel 的顶层位置为显式陈列，在所有排序模式下保持不动。
- AC-1.6 section 操作：section 头 `+` 在区内新建 Channel；`...` = 排序方式 → 重命名（Modal 输入）→ 删除（danger 末位，Modal 红描边确认）；删除 section 不删 Channel，其成员在原 section 位置变为松散 Channel。拖拽期间所有预测线为 overlay、不占布局，源 Channel 行保留原位并以 40% opacity 淡出。

### US-2 委派与持续工作（P0）

> 作为用户，我在 DM 或群聊里给 PersonaBot 发消息，它像同事一样处理并回复；可以同时推进几件事。

- AC-2.1 DM、Channel、Bridge、webhook 和 Assignment Report 先成为 immutable Source Event；Trigger 建立 Bot-specific Inbox Admission。@/DM 默认 immediate，普通消息可 digest，均遵守安全 step/turn 边界（ADR-0025/0036）。
- AC-2.2 Orchestrator 按批次处理 Attention：回复来源、按 exact `sessionId` / unique Continuity Key 询问已有 Assignment，或在权限与全局 capacity 内创建 independent Assignment Session（ADR-0024/0045）。
- AC-2.3 Assignment Directory 按需列出 activity/lastRun、latest report、blocked/waiting/terminal 与 aggregate Subagent activity；默认按 last update 排序，支持 cursor/filter/sort/page size。
- AC-2.4 Assignment Session 在 milestone、blocked/waiting-human、terminal 时通过 `report_to_orchestrator` 回报；Host lifecycle notice 保持不同 provenance；Human Inbox 聚合需要人类动作的 Attention。
- AC-2.5 默认最多 3 个 active independent Assignment Sessions（全局可设 1–32）；达到上限立即返回结构化和 LLM-readable 错误，不排队，不创建 Session。
- AC-2.6 completed-but-resumable Assignment 可显式复用；cancelled/archived/`needs-repair` 不自动恢复；v1 无 Assignment-to-Assignment direct messaging。

### US-3 记忆（P0；平台实现，应用负责可见）

> 作为用户，我能打开、搜索、编辑、回滚每个 PersonaBot 的记忆。

- AC-3.1 记忆编辑器入口：浏览 / 搜索 / 编辑 / 新建 / 删除 / 导出。
- AC-3.2 显示来源与更新时间；git 历史可查。
- AC-3.3 人类编辑冲突：拒绝保存并展示差异（平台规则 M5）。

### US-4 IM 接入（P1，首个渠道）

> 作为团队，我们把 PersonaBot 接进飞书/Lark，它在群里干活、记住客户。

- AC-4.1 通过 Bridge 绑定外部来源（dsh-im 的 Bot/凭据；**domain=lark 优先验证**）；adapter 必须提供 verified account fingerprint、event provenance 与 capability matrix（#78）。
- AC-4.2 Lark 群 / thread 可映射到 Channel，也可按显式 Trigger 直接 admission 到 Bot Inbox；两者都引用同一 Source Event，不复制消息内容。
- AC-4.3 入站附件归档为 content-addressed bytes；只有 Agent/Human 明确保留时才进入 Memory 或 Workspace。
- AC-4.4 客户跟进北极星：群里聊客户 → 档案持续更新 → 换群/换 thread 引用同一档案。
- AC-4.5 编辑、撤回、乱序 revision 与 provider echo 按 provider capability 处理；unsupported/unknown 不伪装成功，也不因 own-sender echo 产生新 attention。

### US-5 审批与安全（P0）

- AC-5.1 回复现有消息通过 trusted Reply Route 自动回到来源；主动选择频道/thread 发布属于 Service Action，必须具备 Provider Capability 与 Human Service Grant。
- AC-5.2 密钥只在 DSH credentials；仓库与配置零明文。
- AC-5.3 记忆中疑似密钥告警并脱敏。
- AC-5.4 外部 side effect 使用 durable Outbox Intent；无法证明结果时显示 `unknown-outcome`，禁止自动重发并要求 Human resolve。
- AC-5.5 Profile Backup 只由 Human 手动 Export/Import 一个 `.botharness-backup` 文件；不自动备份。credentials 永不进入包，restore 后 authority suspended 并明确 rebind/activate。

## 3. 功能需求（应用层）

| 编号  | 需求                  | 优先级 | 说明                                                                                                                         |
| ----- | --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | bundle 组装           | P0     | core + client + 适配器；一条命令安装                                                                                         |
| FR-2  | Roster / 详情 / 新建  | P0     | DSH client 包（React + blobatar + vendored 字形）                                                                            |
| FR-3  | @委派与命令           | P0     | composer `@` + `/bot`                                                                                                        |
| FR-4  | 记忆编辑器入口        | P0     | 复用平台记忆工具与 git                                                                                                       |
| FR-5  | 审批队列              | P0     | `waiting` 展示与确认；approval 需 open turn                                                                                  |
| FR-6  | IM 适配器             | P1     | dsh-im 绑定、入站文件、Lark 验证                                                                                             |
| FR-7  | 诊断                  | P1     | 连接状态、记忆目录检查、权限清单                                                                                             |
| FR-8  | Messaging / Bot Inbox | P0     | SQLite-authoritative Source Event、Channel placement、Admission/Attention、Trigger/Wake、Reply/Service Action/Outbox（v1.1） |
| FR-9  | Builder 创建          | P0     | 对话式创建 BOT；`bot_create` 受工具白名单控制                                                                                |
| FR-10 | Assignment Directory  | P0     | 五个 Orchestrator Assignment tools、`report_to_orchestrator`、capacity/read models（#81）                                    |
| FR-11 | Portability           | P1     | PersonaBot Export + 单文件手动 Profile Backup/Restore/Transfer（#17/#76）                                                    |

## 4. 非功能需求

| 类别   | 要求                                                                                                          |
| ------ | ------------------------------------------------------------------------------------------------------------- |
| 安全   | 最小权限（附录 A）；审批分级；沙箱隔离执行；凭据仅在 credentials 服务；分享边界在导出时选择（ADR-0021）       |
| 密钥   | 仓库与配置零明文；日志/卡片脱敏；UI 不回显密文                                                                |
| 版本   | pin DSH、dsh-im、飞书 SDK、Node；升级过诊断                                                                   |
| 可观测 | 结构化日志；DSH session log；记忆写入有来源与时间戳；git 历史可查                                             |
| 性能   | @ 到「已受理」< 2s（复用基座反馈，无则 Reaction）；首字（不含模型）< 5s；目录树注入 < 2k tokens               |
| 兼容   | Node 22+；Linux 优先；客户端为 web                                                                            |
| 可靠性 | 长连接重连；event/idempotency identity 去重；SQLite/DSH/provider 边界做 bounded reconciliation；Memory 原子写 |
| 易用性 | 安装 → UI 向导 → 可用；界面中文优先                                                                           |

## 5. 里程碑

平台里程碑见 `docs/botharness.md` §7；应用主导的交付：

| #    | 应用侧交付                                                                         |
| ---- | ---------------------------------------------------------------------------------- |
| M3   | Bot 模式 IA、DM Chat 与 files-first Memory 导航（client 包；本地消息存储）         |
| M4   | 文件研究助手闭环；依赖 #77、#79–#81 的 runtime foundation                          |
| M5   | Bridge 适配器；Feishu/Lark contract 先由 #78 验证                                  |
| v1.1 | Messaging / Bot Inbox / Orchestrator & Assignment UI / Bridge（#30、#46–#48、#75） |

## 6. 风险

- 平台风险见 `docs/botharness.md` §8。
- 应用侧补充：客户端 bundle 依赖必须内联（shell 只共享 `react`/`react-dom`）；composer `@` 源目前是全局的（跨会话可见，PoC 可接受）；Lark 国际版长连接若不稳，webhook 例外条款保留（原 AC-5.6）。

## 附录 A：飞书权限清单（最小集）

| 类型 | 值                                             | 用途                        |
| ---- | ---------------------------------------------- | --------------------------- |
| 权限 | `im:message.p2p_msg:readonly`                  | 接收私聊消息                |
| 权限 | `im:message.group_at_msg:readonly`             | 接收群里 @Bot 的消息        |
| 权限 | `im:message:send_as_bot`                       | 以 Bot 身份发消息           |
| 权限 | `im:resource`                                  | 上传/读取图片与文件         |
| 权限 | `im:message:readonly`                          | 下载消息中的附件（可选）    |
| 事件 | `im.message.receive_v1`                        | 接收消息                    |
| 回调 | `card.action.trigger`                          | 卡片交互（审批 / 按钮）     |
| 可选 | `im:message.group_at_msg.include_bot:readonly` | 接收其他机器人 @ 当前机器人 |

## 附录 B：命令与界面速览（规划）

```bash
# 安装（规划）
dsh plugin --profile <profile> add -w deepseekbot

# 配置（规划；主要走 UI，CLI 为无头环境兜底）
dsh --profile <profile>            # 启动；浏览器打开 dsh web 进入「设置 → BotHarness」
```

## 附录 C：参考资料

- 平台规格：`docs/botharness.md`
- DeepSeek Harness：https://github.com/deepseek-ai/deepseek-harness
- IM 基座 [dsh-im](https://github.com/xmanrui/dsh-im)；可靠性参考 [dsh-lark-link](https://github.com/amlyczz/dsh-lark-link)；群/线程路由参考 [dsh-lark-bridge](https://github.com/imetn/dsh-lark-bridge)
- 形象：[blobatar](https://github.com/Alain00/blobatar)；Live2D 后置
- Docker Sandboxes：https://docs.docker.com/ai/sandboxes/

## 附录 D：暂缓项记录

| 项                    | 原因                                                                      | 触发条件                    |
| --------------------- | ------------------------------------------------------------------------- | --------------------------- |
| Live2D 渲染           | 独立插件，消费原始模型/工具/响应信号                                      | 后续单独 grill/wayfinder    |
| Docker `sbx` 沙箱起步 | DSH 内建 sandbox 已覆盖文件隔离                                           | 需要网络白名单 / microVM 时 |
| DM 独立记忆分区       | 单脑 + 导出时选择分享边界（ADR-0021）                                     | 合规要求更严时              |
| 多根 workspace        | 单目录 1:1（ADR-0018）                                                    | 编码场景真实需要时          |
| 跨 PersonaBot 通信    | 目标态经 Orchestrator（ADR-0024）；PoC 只留 seam（registry + 事件）       | 单 Bot 闭环成立后           |
| 无人值守调度          | 委派制先行                                                                | Bot 需要自己发起工作时      |
| 消息保留 / GC         | append-only 文件先落地，保留策略未定（ADR-0030 开放项）                   | 数据量或合规要求出现时      |
| 自定义头像            | 需要设计（预设 / 上传 / 裁剪）；MVP 用 slug 确定性生成（ADR-0032）        | 设计通过后（v1.1）          |
| 头像动效 / 表情       | blobatar motion.css 与 bundle CSS 注入集成未决；Safari 未验证（ADR-0032） | v1.1 单独开票               |

## 附录 E：工程基础设施（v0.6 初始化，v1.0 增补）

| 项                  | 选择                                                                                                        | 来源               |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------ |
| 包管理              | pnpm 12.4.2（`packageManager` 锁定）                                                                        | 复用 GEO-SNS       |
| Node                | `engines: >=22`；`.node-version` = v24.21.0                                                                 | 复用 GEO-SNS       |
| 语言                | TypeScript 7（strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`） | 复用 GEO-SNS       |
| Lint / 格式         | oxlint + oxfmt（printWidth 100、单引号、trailingComma all）                                                 | 复用 GEO-SNS       |
| 测试 / 构建         | vitest · tsdown                                                                                             | 新增               |
| 客户端（v1.0 增补） | `@botharness/client` 使用 **React**（DSH 客户端契约）+ blobatar；依赖必须内联进 bundle                      | DSH client-modules |
| 不使用              | Vite / Cloudflare 工具链                                                                                    | 无独立前端站点     |

常用命令：`pnpm lint` · `pnpm format` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm build`。

## 附录 F：Agent 技能包（v0.7 安装）

- 来源：[mattpocock/skills](https://github.com/mattpocock/skills)（37 个技能，MIT）——安装于 `.agents/skills/`，`.claude/skills/` 为符号链接；`skills-lock.json` 锁定来源与哈希。
- 更新：`npx skills@latest update`。**勿手动格式化这些第三方文件**（oxfmt/oxlint 已忽略 `.agents`、`.claude`、`agent`）。
- 首发技能 **`dsh-plugin-dev`**（全栈 DSH 插件开发：host/client、槽位、RPC、构建与打包）——本仓 `.agents/skills/` 为 canonical，镜像仓 [`BotHarness/dsh-skill`](https://github.com/BotHarness/dsh-skill) 供一键安装（`npx skills add BotHarness/dsh-skill`）；站点渲染为 `botharness.ai/dsh`（DSH Dev Docs）。发布 `pnpm sync:skill` + tag；出处/版本/时间见 skill 的 Provenance（ADR-0033）。
- 技能初始化（对应 `setup-matt-pocock-skills`）：
  - Issue tracker：**GitHub Issues**（`BotHarness/BotHarness`，`gh` CLI；PR 不作 triage 入口）——见 `docs/agents/issue-tracker.md`
  - Triage 标签：默认五角色（`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`）——见 `docs/agents/triage-labels.md`
  - 领域文档：单 context；根 `GLOSSARY.md` + `docs/adr/`（32 篇）——见 `docs/agents/domain.md`
  - `AGENTS.md` 已加入 `## Agent skills` 区块
- 常用技能：`/grill-with-docs`（对齐 + 领域建模）、`/to-spec`、`/to-tickets`、`/tdd`、`/diagnosing-bugs`、`/code-review`、`/research`、`/handoff`、`/wizard`。
