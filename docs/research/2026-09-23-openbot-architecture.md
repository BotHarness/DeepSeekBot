# OpenBot 架构调研 — nightly-labs/openbot（Grokbot 替代方案）

## 0. 元信息

| 项       | 内容                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 问题     | OpenBot 的整体架构与设计逻辑是什么？对 BotHarness / DeepSeekBot 有什么可借鉴之处？其动态/动画头像（含 Grokbot 式 "bloub" 头像）具体怎么实现？                                                                                                                                                                                                                                                                      |
| 上游来源 | <https://github.com/nightly-labs/openbot>；关联：[blobatar](https://github.com/Alain00/blobatar)、[bloub](https://github.com/jeremy-prt/bloub)（此前调研）、[xAI Grok Bot 设计文章](https://x.ai/bot/guides/designing-grok-bot-with-grok-bot)（此前调研已纠正引用）。                                                                                                                                              |
| 日期     | 2026-09-23                                                                                                                                                                                                                                                                                                                                                                                                         |
| 调研方法 | 一手来源优先：浅克隆上游仓库至临时目录，固定在 commit `252df2a4ebb29753c6081c48f4b0ed96cd149ca6`（2026-09-22，`Improve mobile reply reveal animations… (#676)`），读 README / ARCHITECTURE / glossary / AGENTS / NOTICE / CHANGELOG / `package.json` 与 `src/`、`packages/` 源码逐行核对。**未安装依赖、未运行 OpenBot、未做性能实测**；bloub npm 包内部实现与运行时行为一律标「未验证」。所有路径引用相对克隆根。 |

**一句话结论**：OpenBot 是本地优先的 Electron + SolidJS「持久 AI 队友」桌面应用，核心设计是**供应商 CLI 适配层 + 单一 SQLite 权威 + 类型化 IPC 投影**，把 Codex/Claude/Grok/OpenCode 统一成同一套 agent/turn/queue 心智模型；其动画头像**不是位图/骨骼动画**，而是 npm 包 `@norbert_bodziony/bloub` 的**过程化 SVG 形变引擎**（seeded 轮廓 + mood 驱动表情/环/呼吸），外层用「形状即身份、动画只碰脸/框」的约束守住识别度。对 BotHarness 的映射集中在：Avatar/Activity Frame 的 mood 派生、seeded 可复现身份、以及 delta/queue/memory 这三个投影层模式。

---

## 1. 仓库与产品定位

- Bun workspace：桌面应用留在仓库根（`package.json` `name: "openbot"`，`version: "0.17.0"`，`license: "PolyForm-Noncommercial-1.0.0"`，`author: "Norbert Bodziony"`）；`docs/ARCHITECTURE.md:6-28` 说明为何不移入 `apps/desktop`（双版本源 + 签名风险）。
- 自述：「local-first desktop workspace for persistent AI teammates」，支持本地 Codex App Server、Claude Code，以及经 ACP 的 Grok CLI；含本地队列、文件传输、内嵌浏览器、agent 间消息（`README.md:10-20`、What works 列表 `README.md:22-40`）。
- 许可与署名：PolyForm Noncommercial；`NOTICE:4` "includes software developed by Nor Bodziony"、`NOTICE:10` "includes Blobatar 0.2.0"（blobatar 版本署名仍在），但代码里 bloub 只以 `@norbert_bodziony/bloub@0.3.0` + 本地 patch（`package.json:42,275`）出现，**NOTICE 未逐条提及 bloub 0.3.0 —— 未验证其署名义务是否已满足**。
- `docs/glossary.md` 是术语权威：明确 `bot` 不再用于新代码、`BloubBot` 是库名、`agent`/`channel`/`thread` 各自绑死标识符；`AGENTS.md:14-15` 把「迁移不可逆、无备份」列为 non-negotiable。

## 2. 模块地图（四问之一：整体架构）

```text
README.md:336 架构图 + ARCHITECTURE.md workspace map
Electron main (src/main)
├── provider adapters (src/backend): Codex App Server stdio JSONL / Claude SDK / ACP(Grok/OpenCode)
├── SQLite: 命令日志 + 读投影 (openbot.db, node:sqlite)
├── 类型化 IPC handler + preload (src/preload → window.openbot)
└── 沙箱 WebContentsView 内嵌浏览器
        ↕ typed preload bridge
SolidJS renderer (src/renderer) — 侧栏 roster / 对话 / Dynamic Island / 设置

Cloudflare Workers (apps/auth-api): 账号、邮件码、Team 隧道、D1 + R2(账号头像)
Expo RN (apps/mobile): 远程 team host 客户端
Bun Signal (remote/api): SDP/ICE/ticket/TURN
packages/{brand,contracts,logging,team-client,user-errors}: 跨进程契约与品牌资产
```

- 依赖方向：`renderer ──► @openbot/contracts ◄── preload ◄── main ──► backend`（`docs/ARCHITECTURE.md:34-40`）；contracts 是唯一的跨边界类型/校验包。
- 状态所有权（`ARCHITECTURE.md:58+`）：renderer 的 signals/stores 只是**当前屏幕的投影**，「one concern is one record」；持久状态只在 backend + SQLite。另设 `~/OpenBot/Shared/Data/agent-data.db` 给 agent 自建表，`openbot_metadata` 记 owner，仅 owner 可 DROP/ALTER（`ARCHITECTURE.md:90-100` 段）。
- 供应商适配：`src/backend/provider-drivers.ts` 以 `ProviderSignIn` 联合类型（`browser`/`cli-command`/`external`）防止「给没有 CLI 的 provider 开 ChatGPT 登录」这类错误；`CodexAppServerClient` spawn `codex app-server --listen stdio://` 走 JSONL（`app-server-client.ts:67`）。门面是 `agent-service.ts`（约 2.5k 行），`agent-client.ts` 定义 `AgentClient` 接口。
- 流式与事件：provider `item/agentMessage/delta` → `DeltaBuffer`（100ms debounce / 8KiB cap / item 或 turn 完成即 flush，`delta-buffer.ts:30-33,47-66`）→ `AgentEvent` 联合（`packages/contracts/src/ipc-agent-events.ts:34+`，含 `conversation-delta`、`turn-started/completed`、`queue-changed`…）→ preload `IPC_CHANNELS.agentEvent`（`src/preload/index.ts:1161`）→ renderer。flush 只写流式消息那一行而非整 thread，避免「flush 越来越贵打满主进程」（`delta-buffer.ts:75-80` 注释）。
- 持久化：`openbot-db` 迁移 runner 版本化且不可逆（baseline v8 冻结 SQL，`openbot-database-schema.ts:9-13`）；投影表 `projection_agents` / `projection_threads` / `projection_agent_memories` / `channel-chats-v1`；`MemoryStore` 用一个 owner 列把 agent memory 与 channel memory 的 SQL 写一次（`memory-store.ts:8-18,25-40`），子类只命名 owner 并回贴 id（`agent-memory-store.ts:16-47`）。exactly-once 写靠确定性 `commandId`。
- 队列/邮箱：`mailbox-store.ts` 存 `StoredMessage`/`StoredDelivery`（FIFO、`queueOrder`、`status`），sender 可为 `user`/`agent`/`routine`（`mailbox-store.ts:48-80`）；配合 `MailboxDeliveryGate`、`drain-scheduler`、`duplication-gate`、`attention-registry` 等 backend/agent 子模块。
- 设计权威文件：`docs/glossary.md`（命名）、`AGENTS.md`（non-negotiable：信任边界、迁移、脱敏）、`ARCHITECTURE.md#change-rules`（跨 workspace 归属变更规则）与 agent 通信策略（`ARCHITECTURE.md:310-325`，prompt 层策略，无 response filter）。
- 派生 profile：`agent/profile-generation.ts` 用一次性 provider session（无 durable agent/tools）生成结构化 `AgentProfileDraft`，120s 超时、`decodeAgentProfileDraft` 校验；工具 schema 在 `agent/profile-tools.ts`（zod，`avatarSeed`/`avatarHue`/`avatarPath` 互斥）。

## 3. 设计逻辑（四问之二）

1. **本地优先、单一权威**：「user's SQLite database is the source of truth, not a remote cache」「No cloud dependency for core function」（`AGENTS.md` Product constraints）；Cloudflare 只放账号/头像/隧道，不放聊天与命令。
2. **契约先行**：所有跨进程/网络形状在 `packages/contracts` 带 guard（`isAgentEvent` 是唯一跨域联合 guard，`ipc-agent-events.ts:1-4` 注释说明为何 import 各域 guard 而非重述规则）。
3. **投影而非二等存储**：renderer 状态、读投影表、agent 自建共享表——每层写清「谁是权威、谁可丢」。
4. **不可逆迁移 + 备份豁免**：升级前不备份，因此迁移必须 preserve every shipped source schema；迁移里连 `avatarSeed` 都先 mask 再替换（见 §5.5），防止升级后「换脸」。
5. **性能是注释里的产品约束**：delta flush、avatar 30fps 上限、Dynamic Island 动画预算等都有带数字的注释，决策写在代码旁边而非 wiki。
6. **术语纪律**：glossary 把 `bot` 退役、把 `group` 排除出产品术语，避免 IPC 词与产品词碰撞。

## 4. 动态/动画头像实现（四问之四，含代码）

### 4.1 技术栈：bloub 过程化 SVG，不是 GIF/骨骼

- 依赖：`@norbert_bodziony/bloub: 0.3.0`（catalog），本地 patch `patches/@norbert_bodziony%2Fbloub@0.3.0.patch`（`package.json:42,275`）；被 `packages/brand`、`src/renderer`、`apps/mobile` 引用。NOTICE 仍写 Blobatar 0.2.0。
- 组件入口：`src/renderer/src/features/agents/AgentAvatar.tsx` 从 bloub 导入 `BloubBot`、`BotEngine`、`makeBlock`、`POSES`、`RAYON`、`SHAPES` 等（行 1-10），渲染 SolidJS `<svg>`。
- 「bloub」即此前调研里的 x.ai 头像复刻方法（`docs/research/2026-09-19-avatar-and-icon-references.md` §2：单填充形状在 14 态间 morph、眼睛独立、无动画库、`sample(t)` 纯函数）；OpenBot 把它发布为自有 npm 包并打补丁。**补丁 diff 内容与上游 jeremy-prt/bloub 的关系未验证**。

### 4.2 身份 = seeded 轮廓 + 颜色 + 休息表情

`packages/brand/src/bloub-avatar.ts`：

```ts
export function bloubAvatarProfile(seed: string, hue: AvatarHue | null): BloubAvatarProfile {
  const storedSilhouette = requiredItem(SHAPES, stableIndex(`${seed}:shape`, SHAPES.length)).id;
  // … goutte 不支持则二次稳定哈希替换 …
  const expression = requiredItem(
    EXPRESSIONS,
    stableIndex(`${seed}:expression`, EXPRESSIONS.length),
  ).id;
  return {
    shape: silhouette,
    expression,
    color:
      hue === null
        ? requiredItem(AUTOMATIC_COLORS, stableIndex(`${seed}:color`, AUTOMATIC_COLORS.length))
        : HUE_COLORS[hue],
  };
}
```

- `stableIndex` 是 FNV-1a 风格哈希（`0x811c9dc5` / `Math.imul(..., 0x01000193)`，行 114-121）：**同一 seed 永远同形**。
- `avatarCandidateSeeds`（行 83-112）批量生成候选 seed，保证覆盖未见轮廓 + 不重复表情——供创建向导「换脸」用。
- 契约：`AVATAR_SEED_PATTERN = /^[a-z0-9:-]{1,128}$/`、`AVATAR_HUES` 10 档（`packages/contracts/src/ipc-agent-identity.ts:12-13,59`）；profile/runtime/agents/dynamic-island 均带 `avatarSeed`/`avatarHue`。

### 4.3 动画状态：SHAPE_SAFE_STATES + AvatarMood 表

`packages/brand/src/bloub-avatar-motion.ts`：

- `SHAPE_SAFE_STATES = ["idle","wink","wide","notify","swirl"]`（行 18）：只允许 `baseBody === true` 的 bloub 态——注释明确「形状是身份不是动画帧」；`bloub-avatar-motion.test.ts` 对照库目录 `baseBody` 标志，库升级重分类会**测试失败**而非悄悄换形（行 13-16 注释）。
- `AvatarMood = "idle" | "working" | "waiting" | "failed" | "responded" | "connecting" | "asleep"`（行 29）：前五个由运行时信号派生，后两个属「围绕头像的表面」由调用方传入。
- `MOOD_PRESENTATIONS`（行 55-63）——每个 mood → `{state, expression, rings, breathe}`：

| mood       | state  | expression   | rings | breathe |
| ---------- | ------ | ------------ | ----- | ------- |
| idle       | idle   | null(种子脸) | false | 0       |
| working    | idle   | attentif     | true  | 0.03    |
| waiting    | notify | null         | false | 0       |
| failed     | idle   | triste       | false | 0       |
| responded  | idle   | heureux      | false | 0       |
| connecting | swirl  | attentif     | true  | 0       |
| asleep     | idle   | somnolent    | false | 0       |

- `avatarMoodIsBusy`（行 76-79）= rings 或 breathe>0，决定表面是否需要动画时钟。

### 4.4 渲染与性能门控（`AgentAvatar.tsx`）

- 30fps 硬顶：`AVATAR_FPS = 30`（行 24-26），注释给出未封顶实测「30% renderer / 24% GPU（两个可见头像）」；`BloubBot` 与 `OrbitRings` 的 rAF 都按 `1/AVATAR_FPS` 节流（行 164、337）。
- `motion` 类型（`src/renderer/src/bloub-avatar.tsx:7-12`）：`"hover" | "always" | "idle"` —— **性能决定何时动**，与 mood（表达什么）正交。
- 静止 moods 只在 pointer/focus 到达时动（`STATIC_MOTIONS`，行 43-46）：注释记录侧栏未虚拟化时「四个静止头像 idle-window 83 recalc/s」。
- 形状安全：非 idle mood 只播 `[slowerBlock(presentation().state)]`（行 292-295）；hover 循环用 shape-safe blocks（`DEFAULT_CYCLE`：idle/wink/wide，行 31-37）。
- 环（rings）不替换身体：`AvatarRings`/`OrbitRings` 采样 `orbit` pose 的 `frame.arcs` 而不播 `orbit` 整态（行 39-41,136-138）；IntersectionObserver 门控 offscreen（行 190-201）。
- 自定义图片头像：`url` 存在则 `<img>`，mood 由**同一套环/呼吸 CSS** 携带（行 121-127 注释：照片戴不了表情，故 decor 承载 mood）；`app-shell.css:1815-1875` 写了 `data-avatar="image"` 的 rings 与 breathe 关键帧。
- CSS 层（`src/renderer/src/styles/app-shell.css:1826-1863`）：
  - breathe 是**整框 scale**，注释：「the shape an agent is recognised by has to survive every mood，只有画形状的框可以动」；amplitude 来自 mood 表，非 working 恒 0。
  - mood glow 用 `drop-shadow`（waiting=accent、failed=danger、asleep=opacity 0.6），且「never touches the Bloub's own colour，颜色来自 seed 即身份」（行 1845-1846）。
  - `prefers-reduced-motion` 关掉 breathe（行 1859-1862）；`AgentAvatar` 内也订阅 media query（行 297-301）。
- Dynamic Island 实测预算（`OpenBotDynamicIsland.tsx:1331-1345`）：`motion="hover"`、固定 `shape="cercle"`，注释给出带数字的对比——「有头像 4.1% core + 115 layouts/5s，无头像 0.5% + 1 layout」，因为 overlay 盖住 notch 时 bloub `autoPause` 永远认为可见。
- 反面教材写进代码：`AgentActivity.tsx:22-28` 注释——activity 指示器**不再**随机播 comet/burst 动画，「a silhouette is identity, so it is not something to shuffle」，现在统一走 `working` mood。
- 心跳（breathe）触发点：`data-breathe` 只在 presentation.breathe>0 时挂属性（行 87-94），避免「给每个静止行都启动 infinite 动画」。

### 4.5 mood 派生与调用点（四问之四的「状态从哪来」）

- `agent-avatar-mood.ts:33-41` 纯函数 `computeAgentAvatarMoods`，优先级：`failed` > `waiting`(approval/prompt) > `working`(共享 `isAgentWorking`) > `responded`，缺 key = idle；注释解释优先级按「多久需要人」排序，反序会把失败藏在产生它的 running turn 后面。
- `sidebar-agent-states.ts:21-30` 的 `isAgentWorking` 被 badge 与脸**共享**（行 18-19 注释：badge 与脸不能对谁在工作意见不一）：activeTurn、queue hold、starting/running delivery。
- 调用点：`WorkspaceSidebar.tsx:7,75` 调 `computeAgentAvatarMoods`；`SidebarAgentRow.tsx:58`、`SidebarPinnedGroup.tsx:113`、`SidebarAgentIndicator.tsx:64` 传 `motion="idle" mood={…}`；`AgentActivity` 传 `mood="working"`；Island 传 `working ? "working" : "idle"`。
- 持久化与迁移：`agent-store.ts:250-254` 校验 seed/hue；自建 agent 默认 `avatarSeed = agent id`（行 1114）；自定义头像存 `userData/avatars/agents/<agentId>/<version>.<ext>`（行 116,131,579-606），`avatarUrl` 版本化 URL；迁移 `openbot-database-schema.ts:899-919` 用 sentinel mask 保护 seed，防止 id 重写导致升级换脸。UI 上传在 `src/renderer/src/avatar-image.ts`（canvas 方裁 + 多档 WebP 质量压到 ≤512KB）。

## 5. 对 BotHarness 的借鉴（四问之三）

映射到 `GLOSSARY.md` 的 PersonaBot / Bot-state Activity Frame / Avatar：

| OpenBot 做法                                         | BotHarness 可借鉴点                                                                                                            | 优先级 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ |
| mood 表 + 纯函数派生，badge/脸共享 `isAgentWorking`  | Activity Frame 的 Bot state 投影可用同一「优先级纯函数 + 共享 busy 判定」，避免徽章与 Avatar 语义漂移                          | 高     |
| seeded 轮廓 = 身份，动画禁改 silhouette（+测试守卫） | ADR-0032 blobatar 路线已有确定性 seed；若引入 bloub/动效，照抄「shape-safe 白名单 + 对照库目录的测试」                         | 高     |
| `motion`（何时动）与 `mood`（表达什么）正交          | Avatar 属性拆两轴：Presence/Activity 一轴、动画预算（hover/always/idle + reduced-motion）一轴                                  | 高     |
| 带数字的性能注释（30fps、island 4.1%、83 recalc/s）  | DSH 侧栏/动态岛类常驻 UI 的动画预算应写进代码注释与 dsh-ui skill 的 measure-the-shell 流程                                     | 中     |
| 照片头像用同一 decor 承载 mood                       | 「自定义图静止、Activity Frame 携活动」已有 CONTEXT 定义；OpenBot 证明环/呼吸可跨生成图与照片复用（`GLOSSARY.md` Avatar 条目） | 中     |
| DeltaBuffer 100ms/8KiB + 只写变更行                  | IM 适配与会话投影的流式节流、避免按 thread 全量重写                                                                            | 中     |
| MemoryStore 单 owner 列 + 确定性 commandId           | 与 Git-backed Memory 不同构，但 agent/channel 同构 memory 的 owner 抽象、exactly-once 写可参考 channel/memory 聚合             | 中     |
| glossary + non-negotiable 清单                       | 与根 `GLOSSARY.md` 唯一权威、ADR 承载 durable 选择同构；可对照其「迁移不可逆」写法审视 Memory 迁移策略                         | 低     |
| 供应商 `ProviderSignIn` 联合防错                     | Channel/IM adapter 的登录方式建模（浏览器跳转 vs CLI vs 外部）可借鉴 union 而非 optional 字段                                  | 低     |

**不建议直接搬的**：PolyForm Noncommercial 许可、Electron 单体与 `danger-full-access` 运行模型、`bot` 术语遗留、把 x.ai/bloub 视觉身份当可复制资产（见 2026-09-19 调研：MIT 只覆盖代码不覆盖设计）。

---

## 6. 未验证 / 待确认

1. `@norbert_bodziony/bloub@0.3.0` 包内部实现（`BotEngine.sample/setExpression/posed`、`autoPause`、pose 目录）——未安装 `node_modules`，仅从 patch 文件与调用点推断；与 `jeremy-prt/bloub` 的派生关系未比对。
2. 本地 patch `patches/@norbert_bodziony%2Fbloub@0.3.0.patch` 的完整 diff 语义（改动范围、是否回推上游）。
3. NOTICE 对 bloub 0.3.0 的署名义务（当前只署名 Blobatar 0.2.0 与作者名）。
4. 运行时性能数字（30fps 上限收益、island 4.1%/115 layouts、83 recalc/s）均为上游代码注释转述，**本机未复测**。
5. Grokbot「动态头像」若指 x.ai 官方 Grok Bot 的具体动画规范：2026-09-19 调研已认定该 x.ai 文章是工作流文、无身份/头像规范；OpenBot 的 bloub 是工程复刻而非官方资产。
6. 移动端 `apps/mobile` 的 `BloubAvatar`/activity frame 实现（`use-bloub-activity-frame.ts` 等）未逐文件深读，桌面结论向 RN 的可移植性未验证。
7. Team API 远程头像同步（CHANGELOG 提及 WebRTC 头像下载、v2 host 无 body 拒绝）仅见 changelog 叙述，未读协议实现。
8. `apps/auth-api`/`remote/api` 与桌面端的账号头像（R2）数据流未展开。

## 7. 一手来源与访问日期

- 仓库：<https://github.com/nightly-labs/openbot>（浅克隆，commit `252df2a4ebb29753c6081c48f4b0ed96cd149ca6`，2026-09-22）。访问日期 **2026-09-23**。
- 关键引用文件：`README.md`、`docs/ARCHITECTURE.md`、`docs/glossary.md`、`AGENTS.md`、`NOTICE`、`CHANGELOG.md`、`package.json`、`packages/brand/src/bloub-avatar{,-motion}.ts`(+test)、`packages/contracts/src/ipc-agent-{identity,events,profile}.ts`、`src/renderer/src/{bloub-avatar.tsx,avatar-image.ts}`、`src/renderer/src/features/agents/{AgentAvatar.tsx,agent-avatar-mood.ts}`、`src/renderer/src/features/sidebar/{sidebar-agent-states.ts,SidebarAgentRow.tsx,WorkspaceSidebar.tsx,SidebarAgentIndicator.tsx,SidebarPinnedGroup.tsx}`、`src/renderer/src/features/dynamic-island/OpenBotDynamicIsland.tsx`、`src/renderer/src/features/conversation/AgentActivity.tsx`、`src/renderer/src/styles/app-shell.css`、`src/backend/{agent-service.ts,provider-drivers.ts,agent-client.ts,app-server-client.ts,agent-store.ts,memory-store.ts,agent-memory-store.ts,mailbox-store.ts,openbot-database-schema.ts}`、`src/backend/agent/{delta-buffer.ts,profile-generation.ts,profile-tools.ts}`、`src/preload/index.ts`。
- 此前关联调研：`docs/research/2026-09-19-avatar-and-icon-references.md`（blobatar/bloub/许可边界）、`docs/research/2026-09-21-desktop-pet-and-live2d.md`（presence 参考）。
- 临时克隆目录（可删除）：`/var/folders/g6/l2sr95bs5zv75k9x3v6_82800000gn/T/opencode/openbot-research`。
