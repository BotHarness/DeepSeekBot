# dsh-agent-team 调研 — 对照 BotHarness / DeepSeekBot（2026-09-18）

## 0. 方法与元信息

| 项            | 值                                                                                                                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库          | https://github.com/wowyuarm/dsh-agent-team                                                                                                                                                            |
| Pin 的 commit | `ce61be16b461cfbe32e86b134c1cde4ddc19de0f`（v0.1.13，2026-09-17 22:04:05 +0800，`chore: release 0.1.13`）                                                                                             |
| 本地克隆      | `reference/dsh-agent-team`（`git clone --depth 50`，位于调研 worktree `DeepSeekBot-research` / 分支 `research/dsh-agent-team`；`reference/` 已在 `.gitignore:18-19` 忽略）                            |
| 许可          | MIT                                                                                                                                                                                                   |
| 发布形态      | npm `@wowyuarm/dsh-agent-team`；官方安装路径 `dsh plugin --profile web add …`（`README.md:44-62`）                                                                                                    |
| 对照对象      | `docs/botharness.md` v1.4、`PRD.md` v1.0、ADR-0001…0021、`packages/core`（M2，main @ `a3d19fb`）                                                                                                      |
| 方法          | 读其 README / AGENTS / docs（architecture、domain-model、team-collaboration、development、frontend-design）+ `packages/{agent-team,tool-agent-team,client-agent-team}` 关键源码；结论以仓库内行号引用 |
| 范围          | 架构与设计对照 + 可借鉴清单；不运行其代码、不做端到端验证                                                                                                                                             |

**置信度说明**

1. 高置信：DSH 扩展点用法、打包/安装、preset 隔离、记忆注入、下节“坑”类结论——均有一手行号，且本报告撰写时抽查核对了 `cordis.patch.yml`、`member-context.ts`、`context-source.ts`、preset marker（`index.ts:131,2484`）与 `preset-roster.ts`。
2. 中置信：ledger 与协作协议的细节来自按上述方法完成的精读（行号完整），未逐行复核；引用时建议按路径抽查。
3. 推断：第 6 节“对我们的含义”属本报告的映射建议，不是原作者的声明。

---

## 1. TL;DR

`dsh-agent-team` 是同一宿主（DSH）上独立长出来的“持久 Agent 团队成员”插件：**成员是跨 session 的持久身份，私有记忆、职责与 workspace 归属都挂在成员上**。这与 BotHarness 的 PersonaBot 命题高度重合，且在若干 DSH 扩展点的用法上替我们踩完了坑。最值得拿走的五点：

1. **身份/会话/工作区分层与我们相互印证**：Member = 持久身份、Session = 执行、Workspace Participation = 纯关系（join 不迁移 session/cwd），对应我们 ADR-0016/0017/0018。
2. **记忆注入模型几乎可直接对照**：每成员私有目录 + `memory.md` 索引每步注入（8 KiB 预算）+ notes 按需读取；“替换语义 + 与上次注入比对去重”正好回答我们 `docs/botharness.md:123` 的 “tree 注入刷新时机” open item。
3. **协作协议成熟**：append-only operation ledger 单一权威 + 拉取式 Inbox（Attention 水位 + 稀疏 marker）+ 通知只是 hint。对 M3 委派与 M5 IM 的唤醒/去重语义有直接参考价值。
4. **DSH 工程坑的现成答案**：profile/bundle 隔离、preset 隔离防污染、运行时解析 service、slot 注入、非乐观 UI、不自定义 Session message source、Desktop 安装器 strip `@deepseek-ai/*`。
5. **边界**：他们建了 Team / Channel / Thread / Task / Claim 协作实体域；我们 PoC 明确不建（ADR-0017，`docs/botharness.md:76`）。他们的协议是“以后做跨 Bot 协作”的设计输入，不是 M3 要照抄的对象。

---

## 2. 它是什么：核心概念与映射

README 定义：成员是“durable identities for their sessions, keeping memory and responsibilities across them”；Workspace 组织成员与会话；Channel 承载职责；Task Thread 串起同一条工作线；Human 负责路由（`README.md:10-20`）。

| dsh-agent-team                            | 一句话                                                                                 | 我们的对应物（现状/计划）                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Member（Human/Agent）                     | 持久身份，拥有私有 memory/notes/skills/型号；一次只跑一个 `team-member` preset Session | PersonaBot（`GLOSSARY.md:9-11`、ADR-0016）；Agent 永远不是 PersonaBot                          |
| Session                                   | 执行单元，可被 rollover/checkpoint 换代                                                | Session（ADR-0017；“work = Session”）                                                          |
| Workspace / Participation                 | 项目域；join/leave 是纯关系，不移动 session                                            | Workspace（ADR-0018，一目录 1:1；记忆跨 workspace）                                            |
| Private memory                            | `$DSH_HOME/agent-team/members/<id>/{memory.md,notes/,skills/}`                         | 我们的 memory-dir（`PERSONA.md`/`MEMORY.md`/topic files + `.git`，M1-M11）                     |
| Channel / Message / Thread / Task / Claim | 共享协作事实（谁在哪个频道、哪条线的进度、谁承诺了什么方向）                           | **无对应物**：PoC 不做跨 Bot 协作，只留 seam（`docs/botharness.md:76`、`PRD.md:154`）          |
| Operation ledger                          | 唯一权威的 append-only 事实账本，UI/tools/Remote 全是投影                              | 目前是 `bot.json` + 内存状态聚合（`packages/core/src/bots/registry.ts`、`state/bot-state.ts`） |
| Inbox                                     | 成员级未读投影（Host-owned），不是队列                                                 | 待做（委派/IM 唤醒语义）                                                                       |
| Human                                     | `member:human`，负责路由、验收、邀请                                                   | 用户 + 审批分级（`docs/botharness.md:74`、FR-5）                                               |

**重要边界**：他们是“长期共处的团队”（standing team），我们是“个体持久身份 + 委派”。他们的 Team/Channel/Claim 解决“多 agent 在同一项目里互相抢活/对话”的问题；我们 PoC 的目标是“同一个 PersonaBot 跨 session/chat/workspace 连续”，两者交集在**身份与记忆**，分叉在**协作实体**。

---

## 3. 总览对照表

| 轴         | dsh-agent-team                                                                                                                                | BotHarness / DeepSeekBot                                                                                          | 结论                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 宿主关系   | 外部 Cordis bundle，不改 Harness（`AGENTS.md:3-5`）                                                                                           | 外部 DSH 插件层，不 fork（ADR-0015）                                                                              | 同路，可直接对照                                                                |
| 打包       | 单根 npm 包，`packages/*` 是 build/export 缝；`dsh.bundle.patch` + `exports` + `files` + `prepack`（`package.json:13-58,83-145`）             | `@botharness/core` 已声明 `dsh.bundle.patch`（`packages/core/package.json`）；M3.5 正在验证官方安装路径           | 借鉴其隔离 group 与发布布局验证                                                 |
| 身份       | Member 实体 + ledger 持久化；session 可换代但成员不变                                                                                         | PersonaBot registry + `bot.json` + 六态聚合                                                                       | 一致；我们的记忆规格更严                                                        |
| 记忆       | 每成员 `memory.md`（8 KiB 注入上限）+ `notes/` 按需 + `skills/` 双根；无 front-matter、无 git                                                 | 文件为事实源（M1），front-matter（M2/ADR-0012），原子写、来源、每写一 commit（M6），tree 注入 + 按需检索（M3/M4） | 结构同形；注入**刷新/去重**手法值得抄；我们的溯源/回滚更强，不后退              |
| 上下文连续 | `context_rollover` / `context_checkpoint` / `context_timeline`：意图入 session log，Host coordinator 换新 session，旧 session 归档不删        | open：跨 session 连续（M6 SoulSnapshot 是包与分享，不是运行时换代）                                               | 他们是最完整的公开实现，作为 M6+ 设计输入                                       |
| 协作       | ledger + Inbox + Claims + revision fence；通知 = hint，不承诺模型已处理                                                                       | 无 Team 实体；委派是 `@PersonaBot` 唤起 session（M3）                                                             | 分叉；协议留作未来跨 Bot 协作参考                                               |
| 工具面     | 8 个成员工具（含 3 个 context 工具），只在该 preset 内可见                                                                                    | 4 个 memory 工具已注册（`packages/core/src/memory/tools.ts`）；M3 增委派工具                                      | 学其 preset 隔离与执行时服务解析                                                |
| UI         | Team mode：影子 slot（`priority:-100` shadow `sidebar.workspaces`/`main`/`sidebar.settings`）+ footer 入口 + typed Remote + 流式失效 + 非乐观 | M3 计划 `main` 面板 + `sidebar.panellist`（PRD US-1/FR-2）                                                        | 直接可套用                                                                      |
| 持久化介质 | ledger → 仅 `agent_team` 域路由到 SQLite（其余 JSON）；vendor 了 sqlite backend                                                               | 文件优先；SQLite 只作可选索引（ADR-0005）                                                                         | 不照搬；注意 ADR-0005 边界                                                      |
| 测试       | vitest + 每文件隔离 `DSH_HOME` + 真实 Chrome 的“发布布局”浏览器验收（不进 CI）+ ubuntu/windows 双 lane                                        | 13 个 vitest 文件、108 tests（M2）；M3.5 人肉安装验证                                                             | 门禁与隔离手法值得抄                                                            |
| 发布       | 手动、批量；`web` 稳定 / `web-dev` 日驱；peer 范围 `>=0.1.5-rc.1 <0.1.6`；CHANGELOG 双语                                                      | 我们 pin `dsh@0.1.5-rc.2`；M3.5 用隔离 `DSH_HOME` 验证                                                            | 双 profile 节奏可参考                                                           |
| 文档       | 权威序：code > docs > Harness > `.scratch/` 历史；`check:docs` 强制双语成对；`.scratch/active                                                 | archive` 存工作历史                                                                                               | ADR/spec + 生成式文档站（英文主、中文机翻）；research notes 在 `docs/research/` | “一个事实一个家”“归档不回写”可入约定 |

---

## 4. 可借鉴清单（按优先级）

### 4.1 P0 — M3 名册与委派 / M3.5 安装门直接可用

**L1. Bundle/Profile 打包与作用域隔离**

- 做法：单包多缝（`packages/*` 只是 build/export 缝，`docs/architecture.md:9-20`）；`exports` 逐子路径声明、`files` 白名单、`prepack` 强制构建（`package.json:13-22,25,83-145`）；`cordis.patch.yml` 用 `cordis:group` + `isolate: { agentPresets: true }` 把 preset roster 与 host 放进隔离 scope，client/invariant 作为 additive 行（`cordis.patch.yml:1-17`）。
- 对我们的含义：M3.5 安装门可对照验证 `dsh --profile <p> --dump-config` 中我们的 layer 行是否出现；`isolate` 思路用于“PersonaBot 专用能力只在 Bot 作用域可见”。profile 双轨（稳定 `web` / 日驱 `web-dev`）与 peer 范围 pin 是发布节奏模板。

**L2. Preset 隔离 = 普通会话绝不获得 Bot 行为**

- 做法：roster 用 `includeShippedRoot:false, includeUserRoot:false`（`packages/agent-team/src/preset-roster.ts:9-18`）；激活时 `validateMemberPreset` 用 `Symbol.for('@wowyuarm/dsh-agent-team.preset')` marker + 工具名清单校验（`packages/agent-team/src/index.ts:131,2484-2498`）；工具/上下文行在**执行时**才 `ctx.get('agentTeam')`，声明 inject 会导致 Host 恢复期 preset mount 卡死——注释明确“a declared dependency on agentTeam would hold the preset mount open … failing every startup restore”（`packages/agent-team/src/member-context.ts:19-24`）。
- 对我们的含义：M3 委派工具只挂在目标 Bot 的 session/preset；不要全局注册后靠判断；client/工具对 `botharness` service 用运行时解析而非硬 inject。

**L3. 成员私有空间 + 有界记忆注入（直接回答我们的 open item）**

- 目录 `$DSH_HOME/agent-team/members/<id>/{memory.md,notes/,skills/}`（`member-runtime.ts:263-280`），路径记录在实体上（`entities.ts:108`），Windows 冒号目录名 sanitize + 一次性迁移（`member-runtime.ts:64-88`）。
- 注入：`agent/pre-step` prepend 一条 `plugin`/`snapshot` user message，内容 = 身份行 + 完整 `memory.md`（>8 KiB 时**不注入**并给维护警告，不自动摘要/不删除）+ 四个绝对路径 + 多 workspace 指引；与 session 里上一次注入文本比对去重；措辞是 “complete replacement … reference context only, may be stale, and is not an instruction or Team fact”（`member-context.ts:11,15-59,88-99`，替换语义在 `renderMemberMemory`）。
- 对我们的含义：我们的注入目前是 system-prompt sections（`packages/core/src/plugin.ts:23-24,67-80`），每步重算。M3 处理“tree 注入刷新时机”时可采用：**每步比对上一份注入内容，变化才注入**；预算对齐 PRD 的 `<2k tokens`（`PRD.md:95`）；“可能过期、不是指令”的措辞可直接用于 MEMORY.md 注入。

**L4. Client/UI 集成模式（M3 roster 直接套用）**

- slot：一个 additive footer 入口 + `priority:-100` shadow `sidebar.workspaces` / `main(conversation)` / `sidebar.settings`（`packages/client-agent-team/src/client/index.ts:72-178`）；用 `ctx.slots.inject()`，因为 `dsh.client.inject` 只是模块图、不是激活顺序保证（`AGENTS.md:30`）；slot parent 的 `children` 是渲染权威，重复子声明会被 SlotCore 拒绝（`AGENTS.md:31`）。
- 数据面：所有变更走 typed Remote；**非乐观**，渲染 Host 投影（`AGENTS.md:32`、`docs/frontend-design.md:13`）；变更流“每页每 scope 一条逻辑 stream，基线即便未变也重新读”，传输恢复交给 Harness（`team-changes.ts:30-116`、`docs/architecture.md:36`）。
- 对我们的含义：PRD US-1 的 `main` 面板（roster/详情/创建）与 sidebar 入口可按此模式落地；会话状态/进度推送用流式失效而不是轮询。

**L5. 发布布局的浏览器验收**

- 做法：`npm run test:browser` 把构建产物按发布布局（含依赖链接）复制进临时 profile，向 Harness checkout 写入 overlay + e2e，用真 Chrome 跑一条大旅程（安装→入口→建 agent/channel→@提及→as-task→附件→Inbox→已读→刷新持久化→390×844→键盘焦点→断网恢复→退出恢复普通 DSH），截图进 gitignore 的 `artifacts/`（`scripts/run-browser-test.mjs:9-46`、`docs/development.md:84,219,262-266`）。
- 对我们的含义：M3.5 安装门可升级为可重复的旅程（官方 CLI 安装、UI 渲染、重启持久化），特意避免 symlink/peer fallback 造成的假绿；客户端依赖必须内联（`PRD.md:113`）与他们的构建方式一致。

**L6. 激活诊断与可恢复性**

- Presence（`available|working|error|unavailable`）+ 结构化诊断类（`session-refused`/`session-unreadable`/`preset-composition`/`rollover`/`runtime`/`activation`，带 `remediable` 判定）（`entities.ts:151-174`、`index.ts:2500-2564`）。
- 对我们的含义：PRD 六态聚合之上补“为什么不可用、下一步能做什么”，比布尔可用性更适合 roster 详情页。

**L7. 测试门禁与隔离**

- 门禁：`check:docs`（双语成对/链接/索引）、`check:core-skills`、`check:boundaries`（禁止跨包私有相对导入）、`jscpd`（重复率参考而非判定）、`pack --dry-run`；vitest 每个测试文件隔离 `DSH_HOME`（`vitest.config.ts:40-45`）；CI ubuntu+windows 双 lane、pin Harness tag、浏览器验收留本地（`.github/workflows/ci.yml`）。
- 对我们的含义：每文件隔离 `DSH_HOME` 与 boundary 检查可直接抄；Windows lane 对我们在 WSL/Windows 双环境下价值高（他们正是用 Windows lane 防文件名/路径回归）。

### 4.2 P1 — M4 demo / M5 IM 适配器

**L8. 拉取式 Inbox 与“通知只是 hint”**

- 未读 = Attention 水位（`startSequence`/`readThroughSequence`）+ 稀疏 direct markers + activity markers；读取 = 一次批量确认，空 delta 不写账；消息/线程/InboxDelta 同一 operation 原子提交；通知是合并去重的 hint，重启/恢复后从持久状态重新推导（`docs/team-collaboration.md:41-49,91-95`、`ledger.ts:1484-1541,1650-1679`）；“admission is durable, but it does not claim that the model has already processed the update”（`README.md:111`）。
- 对我们的含义：M5 的 `message_id` 去重/重连（`PRD.md:97`）与 M3 “唤醒 idle session vs steer 忙碌 session”的语义可借鉴此状态机；不要把“已处理”写进投递事实。

**L9. 附件缓存**

- `$DSH_HOME/agent-team/attachments/v1/<id>/`，10 MB 上限，72h 引用 / 24h 孤儿 GC，所有路径先验证后原子复制（`docs/architecture.md:47-51`、`index.ts:1187-1238`）。
- 对我们的含义：M5 AC-4.3 “referenced = promoted”与 ADR-0008 的归档目录可参考其原子性规则。

**L10. 固定偏移时间上下文**

- 每 turn 第一步注入时钟快照（UTC+8、显式偏移），带 elapsed 与“先后顺序权威”说明；后续步仅 30 分钟刷新；从 session 事件折叠，不建第二存储（`member-time-context.ts:100-171`）。
- 对我们的含义：IM 跨时区消息便宜且确定性的时间感知；也提醒“时间来自注入而非模型猜测”。

**L11. Typed Remote + 生成物纪律**

- 输入是 Remote 声明，Typert 产物生成且**永不手改**（`AGENTS.md:29`、`scripts/generate-typert.mjs`）；流式失效有 scope 版本语义（`index.ts:648-682`）。
- 对我们的含义：M3 客户端与 Host 的契约照此办理，避免手写 RPC 类型漂移。

### 4.3 P2 — M6/M7 与长期

**L12. 上下文交接三件套（rollover / checkpoint / timeline）**

- 设计：工具只做校验 + `concludeTurn`；意图是一次成功 tool result（进 session log，不进 ledger）；Host coordinator 在结果 durable 后换新 session，旧 session 归档不删；checkpoint ref = `sha256(sessionId + toolCallId)`；崩溃后从日志重放恢复；换代前后有 owned-jobs/claim/前缀收缩等 guard（`context-projection.ts`、`context-management.ts:112-425`、`index.ts:910-982,1562-1646`）。
- 对我们的含义：这是“同一 PersonaBot 跨 session 连续”最完整的公开实现，M6 SoulSnapshot/连续性可作为设计输入（意图入 durable 日志 + 幂等派生 id + 崩溃重放）；注意他们明确不把交接正文写进 ledger、也不迁移 session 格式，且我们不接管 DSH session 存储。

**L13. Ledger/投影模式（原则可抄，介质不可抄）**

- 单一 append-only 权威 + 28 种 operation 闭集 + zod 校验 + replay 校验 + `requestId` 幂等 + `never` 穷尽；投影全部派生；新增 operation 要同时改六处，有清单（`ledger.ts:487-527,2086-2106,419-422`、`docs/development.md:138-166`）。
- 对我们的含义：PoC 不必引入 ledger，但“每个概念只有一个权威 + 不做第二事实源”值得写进架构文档；若 M6/M7 需要版本化/审计，此为参考实现。**注意 ADR-0005**：他们 ledger 落 SQLite，我们只能把 SQLite 当可选索引，事实源仍是文件。

**L14. Workspace participation 是纯关系**

- join/leave 不改 session/cwd；`member.workspaceId` 只记创建地（`docs/domain-model.md:13-15`、`types/operations.ts:203-239`）。
- 对我们的含义：印证 ADR-0018 与“记忆跨 workspace”；M3 多 workspace 展示时不要迁移 session。

**L15. 文档与工作历史实践**

- 权威顺序 code > docs > Harness contract > `.scratch/` 历史，且“prose 与代码冲突以代码为准”（`AGENTS.md:9-20`）；`docs/README.md` 索引 + `docs/AGENTS.md` 路由表；“一个事实一个家”；归档不回写（`docs/AGENTS.md`）；`.scratch/active|archive` 用目录承载跨 session 长任务（`.scratch/AGENTS.md:7-44`）。
- 对我们的含义：可把“一个事实一个家”“归档不回写”写进我们的 AGENTS.md 约定；`.scratch` 与我们 issue-tracker skills 兼容，可作为长任务工作区选项。

---

## 5. 他们踩过的 DSH 坑（我们直接避雷）

1. **不要自定义 Session message source**：Session 格式迁移按闭集校验 `plugin` source 的成员（`kind`/`plugin`/`form`/`sections`/`summary`），插件自定义 kind 类型合法也会被拒绝；结构化负载要走 `sections` 这个 admitted slot（`packages/agent-team/src/context-source.ts:1-24`）。我们若把记忆注入改成 user message，必须走 `agent/pre-step` 的 plugin snapshot 形态，而不是发明 source kind。
2. **不要从 DSH 源码启动**：`pnpm dsh web` 会加载第二份 scope module，导致 “selected preset is not team-enabled”；必须用编译后的 CLI（`README.md:60-62`）。M3.5 安装门同此要求。
3. **Desktop 生成安装器会 strip `@deepseek-ai/*` 并从 host closure 解析**：host closure 没有 sqlite backend 时，引用上游行会阻塞启动，只能 vendor 到自己包名下（`cordis.patch.yml:18-27`，GitHub issue #28）。提醒：我们 externalize 的 `dsh-*` 必须在 Desktop 安装器路径下单独验证；host 不提供的包要自带。
4. **`dsh.client.inject` 不是激活顺序保证**：声明可能尚未存在的 slot 要用 `ctx.slots.inject()`（`AGENTS.md:30`）。
5. **重复 slot 子声明会被 SlotCore 拒绝**：不要复制 shipped 私有 UI、不要重复声明 `sidebar.workspaces.directoryFlow`（`AGENTS.md:31`）。
6. **durable 变更不做乐观 UI**：渲染 Host 投影、失败保留输入（`AGENTS.md:32`、`docs/frontend-design.md:13`）。
7. **运行时解析 Host service**：preset 行 mount 早于 Host 恢复完成，硬 inject 会卡启动（`member-context.ts:19-24`）。
8. **Windows 文件名/路径**：成员目录带冒号必须 sanitize（`member-runtime.ts:64-88`），并配 Windows CI lane 防回归。
9. **不要轮询**：通知 hint + 启动/恢复时重推导（`index.ts:2422`、`docs/team-collaboration.md:93-95`）；也不要 auto-memory / auto-summaries（`.scratch/archive/2026-08/thread-inbox/spec.md:201`）。

---

## 6. 明确分歧（不要照搬）

| 主题        | dsh-agent-team                                                                      | 我们                                                                           | 处理                                                                                   |
| ----------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 协作实体    | Channel/Message/Thread/Task/Claim 一等公民                                          | ADR-0017 明确无 Task 实体；跨 Bot 仅 seam（`docs/botharness.md:76`）           | 他们的 `docs/team-collaboration.md` 作为未来“跨 PersonaBot 协作”设计输入，不进 M3 范围 |
| Ledger 介质 | append-only ledger 落 SQLite（单库、永久、无 compact）                              | ADR-0005：SQLite 只作可选索引；记忆/凭证绝不入 SQLite                          | 原则可抄、介质不可抄                                                                   |
| Persona     | preset YAML 全体共享；个体身份只有 handle + description；无 per-member persona 快照 | `PERSONA.md` 人类所有（ADR-0014）+ SoulSnapshot（ADR-0020）                    | 但我们可学其**分层**：preset 放“Bot 工作方式/行为规范”，`PERSONA.md` 只放个体角色      |
| 记忆严谨度  | 自由 Markdown，无 front-matter/git/原子写规则                                       | M1-M11：文件事实源、front-matter、原子写、来源、每写一 commit、tool-write only | 不后退；其 8 KiB 预算/不自动摘要/“可能过期”措辞可吸收                                  |
| 自动记忆    | 明确拒绝 auto-memory/auto-summaries/timed polling                                   | ADR-0003 / M9 同为 tool-write only                                             | 相互印证，保持                                                                         |

---

## 7. 建议的下一步

1. **M3 issue（#10）增补设计输入**：preset/工具隔离、非全局注册、运行时解析 service、激活诊断（引用本报告 L2/L4/L6）。
2. **M3.5 安装门对齐其验证手法**：`--dump-config` 检查 layer 行、发布布局安装、编译 CLI（不从源码）、重启持久化、浏览器旅程冒烟（L1/L5）。
3. **记忆注入刷新时序**：为 `docs/botharness.md:123` 的 open item 写 spec 增补或 ADR：替换语义 + 与上次注入比对去重 + 预算（L3）。
4. **候选 ADR（跨 Bot 协作延期决议）**：把 pull-Inbox/claim/revision fence 记为未来协作协议候选，PoC 明确不做（L8、第 6 节）。
5. **测试策略**：评估引入 boundary 检查、每文件隔离 `DSH_HOME`、Windows CI lane（L7）。
6. **保持观察**：该项目迭代很快（数日多版），context rollover 三件套与 `.scratch` 工作流值得定期复查（L12/L15）。

---

## 8. 附：关键证据索引

| 主题                  | 一手文件                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 定位与 opt-in         | `README.md:10-20,44-62,106-113`                                                                                                                                |
| 架构权威与边界        | `AGENTS.md:9-33`、`docs/architecture.md:9-20,30-51,86-106`                                                                                                     |
| 打包/隔离             | `package.json:13-58,83-145`、`cordis.patch.yml:1-40`、`packages/agent-team/src/preset-roster.ts:9-18`                                                          |
| 记忆注入              | `packages/agent-team/src/member-context.ts:11,15-59,88-99`、`member-runtime.ts:64-88,263-302`                                                                  |
| Session source 硬约束 | `packages/agent-team/src/context-source.ts:1-24`                                                                                                               |
| 上下文交接            | `context-management.ts:112-425`、`index.ts:910-982,1562-1646`                                                                                                  |
| Ledger                | `ledger.ts:487-527,2086-2106,419-422`、`docs/development.md:138-166`                                                                                           |
| 协作契约              | `docs/team-collaboration.md:9-95`、`docs/domain-model.md:5-127`                                                                                                |
| 前端                  | `docs/frontend-design.md`、`packages/client-agent-team/src/client/index.ts:55-178`、`team-changes.ts:30-116`                                                   |
| 测试/发布             | `docs/development.md:27-84,199-266`、`vitest.config.ts:40-45`、`.github/workflows/ci.yml`、`CHANGELOG.md`                                                      |
| 我们一侧              | `docs/botharness.md:44-52,58-68,72-76,109-123`、`PRD.md:33-108`、ADR-0012/13/15/16/17/18/19/20/21、`packages/core/src/{plugin.ts,memory/*,state/bot-state.ts}` |
