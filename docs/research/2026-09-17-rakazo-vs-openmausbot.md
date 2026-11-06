# rakazo vs OpenMausBot 架构对比（2026-09-17）

## 0. 方法与元信息

| 项            | rakazo                                                                                                                                                | OpenMausBot                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 仓库          | https://github.com/elie222/rakazo                                                                                                                     | https://github.com/milind-soni/OpenMausBot                                                                                        |
| Pin 的 commit | `83698c0de8eefab5993a84ed76cb81674a04ea32`（2026-09-17 01:06:24 -0400，`fix(api): preserve quotes spanning ordered list items (#886)`）               | `b054afda144436bc797ee7bbedfc38ce54938cbc`（2026-09-17 07:28:56 +0000，`fix(test): keep the Codex fake dependency-free (#1388)`） |
| 本地克隆      | `reference/rakazo`（`git init` + `git fetch --depth 1 origin <sha>` + checkout）                                                                      | `reference/openmausbot`（`git clone --depth 1`）                                                                                  |
| 许可          | Apache-2.0（`reference/rakazo/LICENSE:1-3`）；仓库内未见 enterprise/ 之类例外目录                                                                     | Apache-2.0；`enterprise/` 例外为 source-available（`LICENSING.md:1-9`、`enterprise/LICENSE:1-12`、`README.md:388-394`）           |
| 方法          | 先读 README/AGENTS/docs 与 `packages/{adapter-kit,adapters,contracts,db,memory}`，再读 `apps/{api,worker,web,mobile}`；结论均以仓库内一手文件行号引用 | 同左（见 `docs/research/2026-09-17-openmausbot-architecture.md`）                                                                 |
| 调研范围      | 架构轴对照 + 收敛/分歧；不做运行验证                                                                                                                  | 同左                                                                                                                              |

**两个重要说明**

1. 任务书曾假定存在 `docs/research/2026-09-17-rakazo-architecture.md`（rakazo 报告）与 `reference/rakazo` 克隆；本轮开始时两者都不存在，因此本对比报告的所有 rakazo 结论直接来自按 pin SHA 自行克隆的一手文件，**不依赖该报告**。该报告随后由另一会话按同一 SHA 重建；它属于独立材料，引用时仍应复核行号。
2. 两个项目都是 Grok Bot 类产品（rakazo `README.md:11-13`；OpenMausBot `README.md:7-13,59-72`）。复用结论一律映射到我们的 ADR/PRD；「置信度」只反映证据强度（源码明确=高），不代表适配成本。

## 1. 总览对比表

| 轴                 | rakazo                                                                                                                                                                                                                                                                                                                                                                                                       | OpenMausBot                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 语言/栈            | TypeScript；React 19 + Vite + Tailwind；Hono + oRPC；PostgreSQL + Prisma；Better Auth；Graphile Worker；Pi；Electron + Expo（`reference/rakazo/README.md:29-41`）                                                                                                                                                                                                                                            | TypeScript；React 19 + Vite + Tailwind；手写 `node:http` + SSE；`node:sqlite` + JSON 文件；Node ≥24；Electron（`reference/openmausbot/README.md:207-214`；`package.json:3-18,41-62`）                                                                                                                                                                            |
| 拓扑               | 多进程：`apps/api`（Hono/oRPC）+ `apps/worker`（Graphile Worker，例行任务/恢复）+ Postgres + web/Electron/mobile 客户端（`apps/worker/src/index.ts:1-90`；`README.md:11-13`）                                                                                                                                                                                                                                | 两进程：本机 harness server（127.0.0.1:8799）+ React app；Electron 内嵌 harness；无外部服务依赖（`README.md:179-214`）                                                                                                                                                                                                                                           |
| Agent runtime      | 单一运行时 **Pi**（`@earendil-works/pi-agent-core`）；`AgentRuntime` 接口 + BYO 模型（`packages/adapters/src/pi-runtime.ts:1-40`；`packages/adapter-kit/src/interfaces.ts:229-236`；`README.md:40`）                                                                                                                                                                                                         | **Driver SPI** + 17 个内建 driver（Claude/Codex/Grok/ACP 家族/pi/openai-compat…），协议归一化成 canonical RuntimeEvent（`server/drivers/builtIn.ts:22-40`；`server/contracts.ts:214-300`；`shared/runtime-events.ts:22-132`）                                                                                                                                    |
| 数据存储           | Postgres + Prisma，50+ 模型（Bot/Thread/Message/Event/Task/Run/Routine/Computer/Secret/McpServer…）（`packages/db/prisma/schema.prisma` 模型清单）                                                                                                                                                                                                                                                           | 本地文件：`bots.json` + `messages.db`(SQLite/WAL/FTS5) + `events/*.ndjson` + `native/*.ndjson` + `workspaces/<botId>/` + `config.json`（`server/store.ts:1-5`；`server/message-db.ts:1-38,106-124`；`server/config.ts:670-673`）                                                                                                                                 |
| 记忆               | `MemoryDocument`/`MemoryRevision`（Markdown 文本存 DB，带 revision 与来源 run/thread）+ `MarkdownMemoryStore`；另有可选语义记忆 provider（`schema.prisma:828-860`；`packages/memory/src/index.ts:14-100`；`packages/adapter-kit/src/interfaces.ts:192-226`）                                                                                                                                                 | `MEMORY.md`（每 turn 注入前 200 行/24KB）+ `memory/<topic>.md` + `memory/log/日期.md`；per-change journal（工作区外）可 undo（`docs/memory.md:12-47,103-118`；`server/workspace.ts:39-52`）                                                                                                                                                                      |
| 线程/会话/任务模型 | `Thread`（botId 唯一=每 bot 一个自有会话，另有群会话）→ `Message(seq)`；显式 `Task` + `Run`（trigger/lease/checkpoint）+ `Attempt` + `SteeringMessage` + `Event(seq)`（`schema.prisma:463-489,491-535,537-554,556-605,607-623,517-535`）                                                                                                                                                                     | 无独立 Task 实体：「One task = one conversation」（`shared/wire.ts:103-105`）；`WireTask`/`WireMessage` + per-thread NDJSON 事件流；routine 执行记 `RoutineRun`（`server/routines.ts:110-119`）                                                                                                                                                                  |
| 委派               | peer bots + 短命 subagents：`spawn_bot` / `run_subagent` / `bot_message`；子 bot 有 `parentBotId/spawnKey`；群内 handoff（`packages/adapters/src/builtin-tools.ts:759`；`schema.prisma:352-355`；`packages/adapters/src/executor.ts:3154-3204`；`packages/contracts/src/events.ts:230-268`）                                                                                                                 | 受控 peer MCP（`list_bots`/`ask_bot`）+ `delegate_bot`/`coordinate_bots`；按 section 的 **Chief of Staff**；peer allowlist/审批（`server/contracts.ts:162-165,219-223`；`server/chief-of-staff.ts:17-66`；`docs/approval-levels.md:40-54`）                                                                                                                      |
| 电脑/沙箱          | `SandboxProvider` 接口 + Docker/E2B/Daytona/Box/desktop 实现；Team Computer / Private Computer；执行租约、接管（takeover）事件、屏幕 view/control 能力（`packages/adapter-kit/src/interfaces.ts:79-140`；`packages/adapters/src/box-sandbox.ts:69`；`packages/adapters/src/e2b-sandbox.ts:38`；`packages/adapters/src/host-aware-sandbox.ts:23-42`；`docs/computer-runtime.md:3-10,23-80`）                  | Box 云 + Local VM + VPS + container + 「这台电脑」(Cua) + browser；`Surface = cloud                                                                                                                                                                                                                                                                              | vm  | local | browser`；能力位门控；Wayland fail-closed（`shared/wire.ts:52-54`；`server/contracts.ts:216-263`；`docs/computer-use-integration.md:12-21,39-62`；`docs/linux-desktop.md:9-23,178-180`） |
| 审批               | 应用级动作门：`ActionApprovalRule` + `toolRequiresApproval`/`planActionGate` + auto-review judge；卡=MessageBlock `kind:"ask"`，动作 Allow once / Always / Deny；`ExternalEffect` 记录与对账；run 状态含 `waiting_input`（`schema.prisma:117-131,676-696,556-605`；`packages/core/src/action-approval.ts:85,196`；`packages/adapters/src/approval-ask.ts:13-39`；`packages/contracts/src/events.ts:98-117`） | Provider 原生权限模式透传 + Full access 显式桌面授权；per-turn broker（Claude socket / Codex JSON-RPC）；卡带 requestId/allowSession/approvalScope；`RequestOutcome` fail-closed（`docs/approval-levels.md:1-25,101-113`；`server/permission-proxy.ts:61-78`；`server/contracts.ts:78-83,276-283`；`shared/runtime-events.ts:84-119`；`shared/wire.ts:315-347`） |
| 凭证               | `Secret`(ciphertext)/`BotSecret`；AES-256-GCM（`ENCRYPTION_KEY`）+ `EncryptedSecretStore`；`request_secret` 卡、origin 精确匹配、模型无读取工具、每 bot ≤100 条/≤16KB（`schema.prisma:1035-1050,1215-1235`；`docs/bot-secrets.md:1-22`；`docs/self-host-secrets.md:7-17,44-60`）                                                                                                                             | `config.json`（0600）**明文**存 key；UI write-only（只显示 configured + Test 一次只读请求）；凭证请求卡 target 为固定 allowlist（`README.md:376-378`；`docs/custom-engines.md:74-76`；`README.md:134-139`；`docs/self-hosting.md:295-310`；`shared/wire.ts:364-377`）                                                                                            |
| 集成               | Composio / Pipedream Connect / Treg / remote MCP（含 OAuth）/ OpenAPI（`README.md:19`；`apps/api/src/router.ts:2722-2733`；`packages/adapters/src/mcp-oauth.ts:1-12`；`packages/adapters/src/remote-mcp.ts:1-8`）                                                                                                                                                                                            | Composio + 用户自建 MCP server（stdio/http/sse，逐 bot 选择）+ 内建 browser/phone/agents MCP；能力位决定引擎可达性（`docs/custom-mcp-servers.md:1-60`；`server/contracts.ts:136-181,260-263`）                                                                                                                                                                   |
| 客户端             | web + Electron + Expo 三端，共用 `@rakazo/contracts`（oRPC）；移动端 `/rpc/threads/subscribe` SSE + cursor；实时扇出 Postgres LISTEN/NOTIFY（`README.md:11-13`；`apps/mobile/lib/api.ts:886-920`；`apps/api/src/router.ts:1408`；`packages/adapters/src/realtime.ts:29-60`）                                                                                                                                 | React web + Electron + iOS/Android companion + CLI + 外部 MCP 控制面；「零客户端传输、一条 SSE、一个纯 reducer」（`README.md:207-214`；`src/state/store.tsx:1-6`；`docs/desktop-companion.md:71-86`；`docs/mcp-server.md:3-15`）                                                                                                                                 |
| 多租户             | Space/Organization/Member/Invitation，per-space 隔离与角色（`schema.prisma:102-130,147-161,163-214,235-250`）                                                                                                                                                                                                                                                                                                | 单工作区；「多客户」靠 `fleet` 一客户一 OS 用户/进程/端口/域名隔离（`docs/self-hosting.md:312-357`）                                                                                                                                                                                                                                                             |
| 部署               | Docker Compose + Postgres + Caddy（`README.md:45-70`；`docs/self-host.md`）；本地开发需 Docker                                                                                                                                                                                                                                                                                                               | npm CLI / Electron 内嵌 / Docker；无 Postgres；Node 24（`README.md:225-261,349-386`）                                                                                                                                                                                                                                                                            |
| License            | Apache-2.0，无 carve-out（`LICENSE:1-3`）                                                                                                                                                                                                                                                                                                                                                                    | Apache-2.0 + `enterprise/` source-available（`LICENSING.md:1-9`）                                                                                                                                                                                                                                                                                                |

## 2. 架构差异（逐轴：差异、原因、代价、对我们的含义）

### D1. 运行时：单 runtime（Pi） vs 多 driver SPI

- rakazo 只有一个 `AgentRuntime` 实现（`pi-runtime.ts:1-40`），模型经 Pi 统一 BYOK；工具是 Pi 普通工具，因此任何模型都能调用（`docs/computer-runtime.md:5-9`）。好处：行为面、审批/暂停、会话记录只需实现一次；代价：模型生态受 Pi 约束。
- OpenMausBot 把差异留在 driver 层（stream-json / JSON-RPC / ACP / OpenAI-compat），并用能力位把差异暴露给 UI（`contracts.ts:216-263`）。好处：直接用本机已登录 CLI；代价：每个协议都要做审批/中断/恢复适配（`claude.ts:480-556`；`codex.ts:1-9`）。
- 对我们的含义：我们的执行体是 DSH executor（规格 `docs/botharness.md:12-28`），**不是** CLI 编排器；PI 的「单一 runtime」更接近我们的形态——但 OMB 的「边界处归一化 + 能力位」仍是 channel adapter / 工具面设计的正确姿势。

### D2. 数据存储：Postgres vs 本地文件

- rakazo 用 Postgres 承担一切（租约、任务、事件、effect 对账、实时 LISTEN/NOTIFY），因此可以多实例 worker（`apps/worker/src/index.ts:60-90`）；代价是部署必须带 Postgres（`README.md:45-70`）。
- OMB 全部本地：`messages.db` + JSON + NDJSON，刻意无外部依赖（`message-db.ts:1-11`；`README.md:64-72`）。
- 对我们：ADR-0005 已定「SQLite 只作可选索引，记忆/凭证绝不入 SQLite」；OMB 的本地形态更接近 PoC，但**不要把 transcript 做成事实源**——DSH 持有会话日志，我们的记忆事实源是文件（ADR-0002）。

### D3. 审批：应用级动作门 vs provider 原生透传

- rakazo 自己判断动作是否需要批准（`toolRequiresApproval`/`planActionGate`，`packages/core/src/action-approval.ts:85,196`），有规则模型与 auto-review；审批卡是消息块（`events.ts:98-117`），并有 `ExternalEffect` 对账（`schema.prisma:676-696`）。
- OMB 不做判断，原样透传 CLI 的权限模式（`approval-levels.md:1-8`），仅在 Full access 时代为回答（`auto-approve.ts:8-80`）。
- 对我们：我们的 Agent 不是带 permission mode 的 CLI，OMB 的透传不适用；rakazo 的「动作门 + 一等卡片」正对应 PRD US-5 / FR-5 与 `docs/botharness.md` §5 的审批分级。**跟随 rakazo**。

### D4. 任务模型：显式 Task/Run vs 会话即任务

- rakazo：`Task`（prompt/status）+ `Run`（trigger/lease/checkpoint）+ `SteeringMessage`；routine/webhook 触发的执行都有 Run 记录（`schema.prisma:537-554,556-605,607-623`）。
- OMB：无 Task 账本，会话即任务（`wire.ts:103-105`），routine 用 `RoutineRun` 记录（`routines.ts:110-119`）。
- 对我们：ADR-0017 选了 OMB 一侧（无 Task 实体）；但 rakazo 的 Run 说明「无人值守执行需要一条可查询的执行记录」——与我们 ADR-0017 后果（「先加 pending prompt 队列」）并不冲突，可作为未来扩展形态。

### D5. 凭证：密文 + 服务端注入 vs 明文配置 + write-only UI

- rakazo 把凭证加密落库（AES-256-GCM、record-bound AAD），模型无读取工具、后端注入并擦除直接/编码回显；明确拒绝把凭证注入任意 shell/文件/env（`docs/bot-secrets.md:1-22`；`docs/self-host-secrets.md:44-60`）。
- OMB 依赖文件权限 0600 与 UI 不回显，值本身明文（`README.md:376-378`）。
- 对我们：ADR-0006 已定「DSH credentials 服务 + credential reference」；rakazo 的**注入边界**规则（origin 精确匹配、绝不进 shell、只经受控 HTTP）比 OMB 更适合抄进我们的工具面设计；静态 key 的存法仍走 DSH。

### D6. 多租户：Space/Org vs 单 Host + fleet

- rakazo 的一等隔离是 Space（org/space/member）（`schema.prisma:102-161`），所有业务表带 `spaceId`。
- OMB 没有租户概念，单 workspace；多客户是运维层的一客户一 OS 用户/服务/端口（`docs/self-hosting.md:312-357`）。
- 对我们：GLOSSARY.md 的 Host 定义为「单 DSH 进程」（`GLOSSARY.md:43-45`），PoC 无多租户；OMB 侧更贴近。rakazo 的 Space 模型在 M5 以后若有「多团队」需求再看。

### D7. MCP：控制面（OMB 独有） vs 工具面（两者都有，rakazo 更完整）

- OMB 同时有：bot 工具面（自建 MCP server + 内建 agents/computer/browser/phone proxy）与外部**控制面**（有界、不可审批/删数据/动电脑）（`docs/custom-mcp-servers.md:1-60`；`docs/mcp-server.md:3-15`）。
- rakazo 的 MCP 是工具面：MCP server 凭证加密、OAuth 会话、stdio 白名单开关（`env.ts:84-85`；`schema.prisma:1052-1095`；`packages/adapters/src/mcp-oauth.ts`）。
- 对我们：`docs/botharness.md` §6 的扩展面（第三方只读 registry/订阅事件）与 OMB 控制面的「有界」原则同构；工具面的 per-bot 选择与凭证边界可映射到 M5 的 dsh-im/工具权限清单。

### D8. 客户端数据流：一条 SSE + 纯 reducer vs oRPC 事件迭代 + PG LISTEN/NOTIFY

- OMB 强制「app 零传输」并用纯 reducer 折叠一条流（`store.tsx:1-6`），背压策略把 durable 与 screen 帧分开（`sse-fanout.ts:21-49`）。
- rakazo 用 oRPC 契约 + `threads.subscribe` eventIterator（SSE/cursor），扇出走 Postgres `LISTEN/NOTIFY`，客户端按 `ProductEvent` 归并（`router.ts:1408`；`realtime.ts:29-60`；`apps/web/src/lib/thread-events.ts:1-16`；`core/events.ts:194`）。
- 对我们：`@botharness/client` 是 DSH 客户端 bundle（ADR-0015 后果），「一条流 + 纯 reducer」直接适用；PG/多 worker 不适用。

### D9. 记忆可见性：都不等价于我们的 ADR-0013

- OMB：一个 bot 一份记忆；跨会话披露靠 recent-work brief + 私聊 chip 标记（`docs/memory.md:73-101`），无 per-entry visibility/owner。
- rakazo：记忆按 `(space, scope, botId, path)` 隔离 + revision（`schema.prisma:828-860`），同样没有「DM 来源默认 private、群注入时过滤」的规则。
- 对我们：ADR-0013 仍是我们自己的设计；两边都只提供相近但不相同的隐私处理，不能拿来当验证。可以借鉴 OMB 的「披露即标记」交互（chip/审计）。

## 3. 收敛点 = 复用候选（关键章节）

> 判据：两个项目**各自独立**实现同一模式，且模式与我们的 ADR/PRD 对应；「复用形式」区分 **概念**（只借设计）与 **代码形状**（可抄结构，注意 license）。

### C1. 沙箱/电脑 provider 抽象 + 生命周期

- **rakazo 证据**：`SandboxProvider` 接口（provision/prepare/execute/observe/act/sendInput/文件/screen/lease）（`packages/adapter-kit/src/interfaces.ts:79-140`）；Docker/E2B/Daytona/Box/desktop 实现（`box-sandbox.ts:69`；`e2b-sandbox.ts:38`；`host-aware-sandbox.ts:23-42`）；Team/Private computer 与 per-bot 租约、接管事件（`schema.prisma:906-956`；`docs/computer-runtime.md:13-21,23-45`）。
- **OpenMausBot 证据**：`Surface` 枚举 + bot 的 `computer/cloudBackend/autoStartVps`（`shared/wire.ts:52-54,201-207`）；computer 生命周期模块（`server/box.ts`、`server/local-vm-lease.ts`、`server/vps-computer.ts`、`server/container-computer.ts`、`server/shared-computers.ts`）；driver 能力位 `computerMcp` 等（`contracts.ts:216-263`）。
- **为什么值得复用**：两个产品在同一问题上独立收敛到「电脑=可插拔 provider + 显式生命周期 + 能力声明 + 租约/接管」。我们目前只有 DSH sandbox（ADR-0018 workspace=单目录），M1 之后若做「Bot 有一台电脑」，这是最完整的现成参考。
- **映射**：ADR-0018（workspace 单目录）；PRD 附录 D「Docker sbx 沙箱起步」触发条件（网络白名单/microVM）；`docs/botharness.md:77` 工具面。
- **复用形式**：概念 + 接口设计（rakazo 接口比 OMB 更干净；**代码为 Apache-2.0，可抄结构，须保留版权/NOTICE**）。
- **置信度**：高。

### C2. 审批 = 一等对象 + 内联卡片 + allow-once/always/deny + fail-closed

- **rakazo 证据**：审批卡是消息块 `{kind:"ask", approvalEffectId, actions:[allow/always/deny], status}`（`packages/adapters/src/approval-ask.ts:13-39`；`packages/contracts/src/events.ts:98-117`）；规则模型 `ActionApprovalRule`（`schema.prisma:117-131`）；判定 `toolRequiresApproval`/`planActionGate`（`core/action-approval.ts:85,196`）；效果对账 `ExternalEffect`（`schema.prisma:676-696`）；run 有 `waiting_input`（`events.ts:21`）。
- **OpenMausBot 证据**：卡带 `requestId/allowKey/allowSession/approvalScope/held`（`shared/wire.ts:315-347`）；`request.opened/resolved` 事件与 decider 来源（`shared/runtime-events.ts:84-119`）；`RequestOutcome` fail-closed（`contracts.ts:78-83`）；Always=交给 provider 记住、应用不留 grant（`permission-proxy.ts:200-223`）。
- **为什么值得复用**：一个把审批做成「消息块+动作」，一个做成「卡片+事件」，但共同点是：**审批对象可寻址、可等待、可审计、拒绝即安全默认**——这正是我们 US-5/FR-5 要的形态。
- **映射**：PRD US-5（AC-5.1）、FR-5（审批队列与 `waiting` 展示）；`docs/botharness.md:74`（审批分级）；状态模型 `waiting`（`docs/botharness.md:37-40`）。
- **复用形式**：概念 + 卡片字段表；实现自研（DSH approval 需要 open turn，见 PRD §6）。
- **置信度**：高。

### C3. 服务端权威事件流 + 客户端 reducer + 游标回放

- **rakazo 证据**：`ProductEvent`（threadId+seq+type+payload）（`contracts/events.ts:272-283`）；每 thread `nextEventSeq/nextMessageSeq`（`schema.prisma:463-489`）；`threads.subscribe` eventIterator（`apps/api/src/router.ts:1408`）；移动端 SSE 带 cursor（`apps/mobile/lib/api.ts:886-920`）；客户端归并函数（`apps/web/src/lib/thread-events.ts:1-16`；`core/events.ts:194`）。
- **OpenMausBot 证据**：单一 `ServerFrame` 联合（`shared/wire.ts:438-461`）；一条 `GET /api/events`，Last-Event-ID 回放 + 断连策略（`server/index.ts:12537`；`sse-fanout.ts:21-67`；`docs/self-hosting.md:440-444`）；「pure reducer + async 只在 wrapped dispatch/SSE fold」（`src/state/store.tsx:1-6`）。
- **为什么值得复用**：两边都把「服务端是唯一事实源、客户端只折叠事件」当作纪律；我们在 M3 做状态事件与 roster 实时更新（`docs/botharness.md:40`；architecture §6），这是最直接的实现参考。
- **映射**：`docs/botharness.md:40`（状态事件）；architecture §6（事件表）、§8（Tracker 订阅非轮询）；PRD AC-2.3。
- **复用形式**：概念 + 客户端 reducer 结构（OMB 的 store 形状可参照；TS 代码 Apache-2.0）。
- **置信度**：高。

### C4. Provider/运行时接口归一化 + 能力声明 + 未知降级

- **rakazo 证据**：`AgentRuntime` 两方法接口（run→AsyncIterable 事件、abort）（`packages/adapter-kit/src/interfaces.ts:229-236`）；`AgentRuntimeCapabilities`（`packages/adapter-kit/src/types.ts:446`）；实现 `PiAgentRuntime`（`pi-runtime.ts:1-40`）。
- **OpenMausBot 证据**：`ProviderDriver.create()` + `ProviderAdapter`（`contracts.ts:214-300,446-461`）；能力位不给就不展示（`contracts.ts:216-263`）；未知 driver/decode 失败→ shadow 降级（`registry.ts:80-122`）。
- **为什么值得复用**：都是「薄接口 + 事件流 + 能力声明 + 失败不致命」；这正是我们 ADR-0015 薄插件/契约测试的形态，也是我们读 dsh-im 基座存储时的稳定边界做法（ADR-0011 后果）。
- **映射**：ADR-0015（插件层）、ADR-0011（只读基座存储、模块隔离）；架构 §8 通信与边界。
- **复用形式**：概念（接口设计）；不直接抄代码。
- **置信度**：高。

### C5. 每线程持久记录 + 序号 + 独立事件日志（可回放、可诊断）

- **rakazo 证据**：`Message (threadId,seq)` 唯一、`Event (threadId,seq)` 唯一（`schema.prisma:491-535`）；thread 维护 next seq（`schema.prisma:463-474`）。
- **OpenMausBot 证据**：SQLite per-message INSERT/UPDATE + FTS5 recall（`message-db.ts:1-38,106-124`）；canonical NDJSON per-thread（脱敏、轮转上限）+ native tee（`bus.ts:44-95`；`native.ts:1-27`）。
- **为什么值得复用**：两边都把「对话记录」与「运行时事件」分开持久化——这正是我们架构文档「DSH session log + 结构化日志」和 M4 诊断闭环需要的形状。
- **映射**：PRD 非功能「可观测」；architecture §8；M4 演示闭环。
- **复用形式**：概念 + 日志文件布局（NDJSON + 脱敏 + 上限）。
- **置信度**：高。

### C6. 例行任务 = 持久记录 + 下次触发 + 运行结果 + webhook 触发（可幂等）

- **rakazo 证据**：`Routine`（crons[]/timezone/active/nextRunAt/webhookEnabled/githubEnabled）（`schema.prisma:698-720`）；cron 计算 `nextCronDateAcross`（`core/cron.ts:199`）；Run trigger 含 `routine`/`webhook`（`packages/contracts/src/runs.ts:19-31`；`schema.prisma:556-605`）。
- **OpenMausBot 证据**：Routine + RoutineRun 状态机（`routines.ts:67-119`）；interval anchor 对齐（`routines.ts:619-625`）；同 routine 不叠加、≤12h 补跑、更老 missed（`routines.ts:1370-1392`）；webhook 幂等/限流/pending 上限（`webhooks.ts:52-82`；`README.md:309-325`）；continuity 把上次报告带入下次（`routines.ts:95-98`）。
- **为什么值得复用**：两个独立产品都收敛到「routine 是记录、run 是执行、触发是事件、重复触发要防抖」；我们目前是委派制（ADR-0017；PRD 附录 D「无人值守调度」暂缓），一旦解禁，这组语义就是最小正确集。
- **映射**：ADR-0017（无 Task 实体；未来先加 pending prompt 队列）、PRD 附录 D。
- **复用形式**：概念 + 调度语义清单；不要抄 OMB 的文件存储（我们用 DSH storage）。
- **置信度**：高。

### C7. 凭证「写入即忘」：不回显 + 目标白名单 + 服务端代注入

- **rakazo 证据**：`request_secret` 卡（origin 先展示、提交即清空输入、值不入消息/事件/模型输入）；加密落库；`list_secrets` 无值；模型无读取工具；origin 精确匹配；拒绝注入 shell/文件/env；限 100 条/16KB（`docs/bot-secrets.md:1-22`）；`BotSecret`/`Secret`（`schema.prisma:1035-1050,1215-1235`）。
- **OpenMausBot 证据**：UI 只见 configured 标志 + Test（一次只读）（`README.md:134-139`；`self-hosting.md:295-310`）；凭证请求卡的 `target` 是固定 allowlist，绝非任意配置路径（`shared/wire.ts:364-377`）。
- **为什么值得复用**：两个产品独立收敛到「秘密只写不读 + 目标可枚举 + 由服务端持有并代注入」；这正是 ADR-0006 的 UI/工具面支撑。
- **映射**：ADR-0006；PRD AC-5.2、M8；`docs/botharness.md` 非功能「密钥」。
- **复用形式**：概念 + 交互细节（Test 按钮、configured 标志、allowlist target）；存储仍走 DSH credentials。
- **置信度**：高。

### C8. Bot 名册模型：每 bot 模型/身份色/固定/分组 + 活动态

- **rakazo 证据**：`Bot`（name/title/description/instructions/color/pinned/position/sectionId/modelProvider/modelId/thinkingLevel/archivedAt/parentBotId/computerId/voiceId）（`schema.prisma:338-397`）；`BotSection`（`schema.prisma:398-415`）。
- **OpenMausBot 证据**：`WireBot`（soul/avatar/color/`modelSelection`/`computer`/`pinned`/`hidden`/`section`/`chiefOfStaff`/`peers`/`activity`）（`shared/wire.ts:171-254`）；`sections` 帧（`wire.ts:439`）；右击菜单（pin/unread/duplicate/hide/delete）（`README.md:124-131`）。
- **为什么值得复用**：两边都把「Bot 像联系人」落到同一组字段；我们的 PersonaBot 目前是 `bot.json`（slug/displayName/avatar/preset/workspaces），模型/固定/分组/活动态正是 M1 registry 与 M3 roster 要补的（`docs/botharness.md:30-40,99`）。
- **映射**：ADR-0016（Bot 一等实体）；PRD AC-1.1–1.4；architecture §4/§6。
- **复用形式**：概念 + 字段清单（字段名可另取，勿照抄 UI 语义）。
- **置信度**：高。

### C9. Bot 间委派＝harness 中介的工具调用 + roster 提示词

- **rakazo 证据**：`spawn_bot`/`run_subagent` 等委派工具（`packages/adapters/src/builtin-tools.ts:759`；`executor.ts:3154-3204`）；子 bot `parentBotId/spawnKey`（`schema.prisma:352-355`）；`bot_message_received/sent` 消息块与 hop 限制（`contracts/events.ts:249-268`）。
- **OpenMausBot 证据**：`integrations.agents` MCP proxy `list_bots/ask_bot`，turn/权限/递归限制归 harness（`contracts.ts:162-165,219-223`）；`delegate_bot/coordinate_bots` 提示词与 Chief roster（`chief-of-staff.ts:17-66`）；peer allowlist/审批（`shared/wire.ts:233-236`）。
- **为什么值得复用**：我们「跨 PersonaBot 通信只留 seam（registry+事件）」（`docs/botharness.md:76`；PRD 附录 D）。两边独立实现了同一安全形态：**委派必须经宿主中介，不能让 bot 直连对方进程**；将来解禁时直接照此设计。
- **映射**：`docs/botharness.md:76`；PRD 附录 D「跨 PersonaBot 通信」触发条件。
- **复用形式**：概念 + 工具面/提示词结构。
- **置信度**：高。

### C10. 中途转向/排队（steering）：三态语义与「不重放」纪律

- **rakazo 证据**：`SteeringMessage` 模型 + `claimSteering`（`schema.prisma:607-623`；`adapter-kit/src/types.ts:340,404`）。
- **OpenMausBot 证据**：`SteerOutcome = steered/refused/indeterminate`，明确「indeterminate 不得重放」（`contracts.ts:285-303`）；`capabilities.queueing` 控制 composer 是否可中途输入（`contracts.ts:255-256`）；queue-and-steer 排队语义（`steer-queue.ts:1-17`）。
- **为什么值得复用**：我们的委派是「工位忙则开子会话」或排队（`docs/botharness.md:73`），迟早会遇到「正在跑的长任务想插话」；OMB 的三态是防止重复执行的关键细节（我们 DSH continuable subagent 也适用同款推理）。
- **映射**：`docs/botharness.md:72-75`（委派/执行）；PRD AC-2.2。
- **复用形式**：概念 + 状态机（tri-state 命名）。
- **置信度**：中高（rakazo 侧只确认了模型与接口，未确认端到端 UX）。

### C11. Bot/团队的可携带导出：人格+例程+记忆为数据，凭证永不随包

- **rakazo 证据**：`ExportManifest`（bot 的 name/title/description/instructions + memory 文档 + routines + files + history）（`packages/contracts/src/domain.ts:1201-1210`；`rpc.ts:736-737`）。
- **OpenMausBot 证据**：团队 `.md`（YAML frontmatter：members 含 soul、rooms、connectors；导入时连接默认关、routines 暂停、零凭证）（`server/team-manifest.ts:1-70`；`README.md:151-163`）。
- **为什么值得复用**：两边独立收敛到「人格/例程/记忆是数据，可打包迁移，但凭证/会话/权限不随包」；我们的 `PERSONA.md` + 记忆目录 + `bot.json` 天然适合做成这种包（也是 ADR-0012 front-matter 的延展）。
- **映射**：ADR-0012（front-matter）、ADR-0014（人格人属）、M5 客户跟进场景。
- **复用形式**：概念 + 清单（OMB 的 YAML frontmatter 形态比 rakazo JSON 更贴我们的 Markdown 记忆）。
- **置信度**：中高（rakazo manifest 形态明确；OMB 外部格式文档未随仓）。

## 4. 分歧点（该跟谁，以及是否推翻我们现有选择）

| #   | 分歧          | rakazo                         | OpenMausBot           | 我们的选择                                                                          | 依据                                                    |
| --- | ------------- | ------------------------------ | --------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | 运行时数量    | 单 Pi                          | 多 driver             | 跟 DSH：单执行体，插件做通道/工具                                                   | `docs/botharness.md:8,12-15`；ADR-0015                  |
| 2   | 存储形态      | Postgres+Prisma                | 本地文件/SQLite       | 记忆=文件（ADR-0002）；SQLite 仅可选索引（ADR-0005）；DSH 持有会话日志              | ADR-0002/0005                                           |
| 3   | 审批归属      | 应用级动作门                   | provider 原生透传     | 跟 rakazo 的动作门（宿主级审批），不复刻 provider mode                              | PRD FR-5；`docs/botharness.md:74`（外部副作用→waiting） |
| 4   | Task/Run 实体 | 有 Task+Run                    | 会话即任务            | 维持 ADR-0017（无 Task）；future：只加 pending prompt 队列，需要时再引入 Run 类记录 | ADR-0017 后果                                           |
| 5   | 凭证静态存储  | 密文+服务端注入                | 明文 0600             | 跟 rakazo 的边界规则 + ADR-0006 的 DSH credentials 存储；**拒绝**明文               | ADR-0006；PRD AC-5.2                                    |
| 6   | 多租户        | Space/Org                      | 单 Host + fleet       | PoC 跟 OMB 单 Host；多租户不抢先设计                                                | `GLOSSARY.md:43-45` Host；PRD 非目标                    |
| 7   | MCP 控制面    | 无（仅工具面+OAuth）           | 有界 stdio 控制面     | 记录为后续扩展形态；与 §6 扩展面同构                                                | `docs/botharness.md:92`；`docs/mcp-server.md:3-15`      |
| 8   | 客户端数据流  | oRPC eventIterator + PG fanout | 一条 SSE + 纯 reducer | M3 跟 OMB 形态（单流+reducer），传输仍是 DSH 客户端 bundle                          | ADR-0015 后果；architecture §6                          |
| 9   | 记忆可见性    | 空间/作用域隔离                | 单脑 + 披露 chip      | 维持 ADR-0013（单脑 + visibility/owner）；两者都不能验证我们                        | ADR-0013                                                |
| 10  | 记忆存储介质  | DB 行（Markdown 文本）         | 纯文件                | 维持文件（ADR-0002），可借鉴 revision/undo 的语义                                   | ADR-0002/0005                                           |

## 5. 复用清单（排序后，落到 M1/M3/M5）

| 排名 | 复用项                                                                               | 形式            | 落到哪个里程碑                  | 动作                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------ | --------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1    | 单流+纯 reducer 的客户端数据流（C3）                                                 | 概念            | **M3**                          | `@botharness/client` 只订阅一种状态事件流；reducer 保持纯函数；durable 事件不丢、可重放                               |
| 2    | 审批对象与卡片字段（C2）                                                             | 概念 + 字段表   | **M3**（展示）/M4（联调）       | 定义 approval 一等对象：id/tool/summary/allowOnce/allowAlways/deny/等待态；approval 需 open turn 的约束按 PRD §6 处理 |
| 3    | Bot 名册字段（C8）                                                                   | 概念 + 字段清单 | **M1**（registry）/M3（roster） | `bot.json` 增补 model/preset、pinned、section、activity 聚合；对齐 `docs/botharness.md:30-40`                         |
| 4    | 记忆 journal + 预算 gauge + hash 冲突（OMB 记忆三件套，属第 3 节 C7 之外的落盘纪律） | 概念 + 代码形状 | **M2**                          | journal 放记忆目录外；turn 边界 diff；expectedHash 冲突拒绝（AC-3.3 已要求拒绝保存并展示差异）                        |
| 5    | 能力位 + 未知降级（C4）                                                              | 接口设计        | **M1**                          | dsh-im 存储适配层与 renderer 扩展都按「能力声明 + 降级不崩」写                                                        |
| 6    | 每线程 NDJSON + 原生 tee（C5）                                                       | 代码形状        | **M1/M4**                       | 状态事件落 session 日志；脱敏与轮转上限照抄 OMB 纪律                                                                  |
| 7    | 记忆写入工具的动作集（OMB `memory_update` append/replace/supersede/remove）          | 代码形状        | **M2**                          | 我们的 `memory_*` 工具直接采用四种动作语义 + 系统提示「只走工具」                                                     |
| 8    | credentials 写入即忘 + allowlist target（C7）                                        | 概念            | **M1/M5**                       | 设置页只回显 configured；凭证卡 target 固定枚举；Test 按钮一次只读                                                    |
| 9    | routine/webhook 语义（C6）                                                           | 概念            | M4 之后（解禁无人值守时）       | anchor 对齐、skip-if-running、≤12h 补跑/missed、deliveryId 幂等、限流                                                 |
| 10   | SandboxProvider 接口（C1）                                                           | 接口设计        | M4 之后                         | 若做「Bot 的电脑」，以 rakazo 接口为底稿（provision/prepare/execute/observe/act/lease/takeover）                      |
| 11   | 团队/人格可携带包（C11）                                                             | 概念            | **M5**                          | 用带 YAML frontmatter 的 Markdown 做 PersonaBot 模板导入导出（不含凭证）                                              |
| 12   | 委派中介与 roster 提示词（C9）                                                       | 概念            | 跨 Bot 通信解禁时               | harness 中介 + peer allowlist + 递归限制                                                                              |

**License 注意**：两家都是 Apache-2.0，理论上可复制代码，但都必须保留版权与 NOTICE；OpenMausBot 的 `enterprise/`（source-available）与 `third_party/` 中的第三方组件**不可照抄**（`LICENSING.md:12-25`；`third_party/cua-driver/README.md:1-12`）。名册/审批等 UI 与文案属于产品表达，建议只借结构。

## 6. 存疑与未验证

- **材料时序**：`docs/research/2026-09-17-rakazo-architecture.md` 在本报告完成后才由另一会话按同一 SHA 重建；本报告的 rakazo 结论未使用它，二者相互独立，可交叉校验。
- **未运行验证**：两个项目都只做静态阅读；所有运行时行为（Docker/E2B/Daytona/Box、Pi 执行、Cua 实机、Electron companion）均**未验证**。
- **rakazo 侧**：未逐行审计 `executor.ts`（4,993 行）内的完整审批/效果重放路径；auto-review judge 的判定质量与失败模式未验证；`Thread.botId @unique` 与「群会话」的交互只从 schema 推断。
- **OpenMausBot 侧**：team 包格式文档在外部仓库，本 clone 只有 schema；`memory tree injection` 与我们 ADR-0004 不是同一物；enterprise entitlement 实现未审计。
- **对照的完备性**：C10（steering）在 rakazo 侧只确认模型与接口，端到端 UX 未验证，置信度已下调为中高；C11 两边的包格式并不互操作，只共享设计原则。
- **对 ADR 的影响**：本报告未发现需要推翻的现有 ADR；分歧点 3/5/8 属于「实现形态跟随哪一侧」的细化，建议在 M2/M3 设计时以 ADR 修订或新 ADR 落锤。
