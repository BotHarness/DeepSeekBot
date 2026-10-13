# DSH 上的 BotHarness Runtime 架构

这份由 BotHarness 产品文档拥有的参考，描述构建在 DSH-native Agent、Session、Workspace、Tool 与 Subagent 之上的 **BotHarness-proposed** 产品层。它不是上游 API 清单。产品术语的定义只存在于根目录 [`CONTEXT.md`](/zh/dev/design/context)，DSH/Cordis 术语则归 [DSH 规范 Context](/zh/dsh/context)；本页只解释两层对象在运行时的关系。

## 不变量

> Channel 是 social world；PersonaBot 是 product actor；Session 是 Agent execution context。三者不能互相充当身份。

```text
Channel != PersonaBot != Session != Agent
Chat UI != Session
```

## 原生 Human 等待：已验证边界

固定 DSH `0.2.0-rc.1` 上的 [#1036 有界实验](../research/1036-native-wait-experiment.md)
证明独立 Assignment 等待审批时，Orchestrator 能真实处理并回复无关 Inbox 消息；
Assignment 运行许可没有释放。Orchestrator 自己的原生审批／正式提问仍持有当前 Step，
Admission 和 steering 接受不等于模型处理，原操作决定并返回后才开始处理无关输入。
原 Session／call 归属及当前 Grant 检查保持权威，变更／撤销范围拒绝原调用。
[ADR-0045](../adr/0045-orchestrator-manages-assignments-through-a-durable-directory.md#native-human-wait-qualification-2026-10-09)
记录此资格边界，不改变 ADR-0035 的单一 Orchestrator root 约束。
[#1220](https://github.com/BotHarness/DeepSeekBot/issues/1220) 阻塞缺失的受支持机制；
#1037／#1038 生产 continuation 仍保持 gate。

[#1037 容量候选](../research/1037-assignment-approval-capacity.md) 在 RC1 上验证更窄的独立 Assignment 路径：保留原生审批等待，只释放已静止 root 的 application 运行名额，在返回 outcome 或执行工具／模型 Step 前重新取得名额；有后代的 root 保守占用名额。这没有新增同一 Orchestrator 的挂起机制，也不解除整体 continuation 或隐私 gate。

## 三张图

在架构图和数据模型中始终显式分开以下三张图。

### Product IM 图

```text
Human <-> Human
Human <-> PersonaBot
PersonaBot <-> PersonaBot
through Channel/DM and ctx.messaging (proposed)
```

PersonaBot-to-PersonaBot communication 是 peer social communication，不是 Subagent messaging。

### Product ownership 图

```text
PersonaBot
|- one Orchestrator root Session
|- zero or more independent Assignment Sessions
|- durable ownership/directory metadata
`- zero or one attached Memory Repository in v1 (optional capability)
```

Session Ownership 把每个 root Session 关联到一个 PersonaBot 及其 root role。它不是 DSH `parentSession` delegation edge。

### DSH delegation 图

```text
Assignment Session
`- main Assignment Agent
   `- Subagent Session
      `- nested Subagent Session
```

Subagent Session 表达 Assignment Session 内的 parent-child delegation。独立 Assignment Session 是全新的 top-level DSH Session。

## Bot Inbox 与 Agent Inbox

```text
Source Event    = immutable product content/provenance fact
Inbox Admission = durable PersonaBot eligibility/reference fact
Bot Inbox       = Admissions 与 Attention Decisions 之上的 PersonaBot-level view
Agent Inbox     = 在指定 delivery boundary 上使用的 DSH execution queue
```

Internal Channel、external IM、webhook、Assignment Report、Assignment Lifecycle Notice 与 system source 都先产生 immutable Source Event。Inbox Trigger 可以为一个或多个 PersonaBot 创建 Admission，但不能复制内容。把内容或忠实、可操作的摘要读入 Orchestrator turn 才算 Observation；只列出 metadata 或 Human UI 查看不算。

Provider edit 或 recall 会产生 Source Revision。Reply 使用 provenance 中可信、非 secret 的 Reply Route；主动 provider-specific Service Action 需要单独选择和授权。Raw external payload 绝不能直接进入 Agent Inbox。

## Wake Policy 与 Delivery Policy

Wake Policy 必须在 Orchestrator 外部运行，因为 sleeping Orchestrator 不能决定是否唤醒自己。随后 Delivery Policy 根据 Wake decision 与当前 Orchestrator liveness 选择安全的 DSH boundary。

```text
provider/internal input
-> 一个 botharness.db transaction：Source Event + optional placement + Admission
-> Wake Policy：immediate / digest / no automatic wake
-> Delivery Policy：next step / next turn / explicit whole-turn abort
-> DSH Agent delivery primitive
```

忽略 Inbox 是 Attention Decision，不是 Wake result。Delivery Policy 根据 Orchestrator 实际 Turn/Step state 选择，而不是只根据 priority 猜测 timing。

必须区分：

- 当前 Turn 结束后交付；
- 下一 Step 前交付；
- 请求取消或中断当前工作。

第三项是独立 capability，并非所有 in-flight Tool/Provider 都支持。

## Orchestrator Session

Orchestrator Session 是 PersonaBot control plane。它负责高层 social behavior，并决定工作如何继续：

- list/read admitted Source Event，并记录 Attention Decision；
- 决定是否回复以及回复到哪里；
- list、inspect、create/reuse、address 与 stop Assignment Session；
- 接收 Assignment Report 与 Assignment Lifecycle Notice；
- 协调 PersonaBot-to-Human 与 PersonaBot-to-PersonaBot messaging；
- 维护高层 goal 与 Channel behavior。

Orchestrator 应保持轻量。仓库修改、大型 Tool output、深层 project context 与详细 Assignment execution trace 属于 Assignment Session。

PersonaBot 与 Orchestrator Session 是 durable identity；live Orchestrator Agent object 可以按需 resume。

## Assignment Session

Assignment Session 是一条独立工作线对应的 root DSH Session。它的 DSH Session id 是 canonical identity；BotHarness 不再创建第二个 Assignment id。它可以带 PersonaBot-local Continuity Key、绑定 Workspace，并使用专门的 model/dependency configuration。

**Assignment Directory** 是 durable read model，基于 Session Ownership 加上 DSH event、projection 与 cold-query fact 构建。它暴露：

```text
canonical Session id、purpose、Continuity Key、Workspace
requested model/dependencies
DSH-derived activity 与 lastRun
latest semantic Assignment Report
aggregate descendant activity
```

DSH-derived activity 与 semantic reported outcome 必须分开；不能再复制一套 BotHarness Assignment status lifecycle。列表支持 filter、order、opaque cursor pagination，默认按 `updatedAt DESC` 排序并以 Session id 打破并列；inactive row 只有显式 history filter 才返回。DSH Subagent 绝不会成为 top-level Assignment row。

Host-lifetime **Assignment Runtime** 拥有 live Assignment AgentHandle。Orchestrator-scoped code 不拥有它们，因为 Orchestrator Agent teardown 不应隐式结束独立 Assignment lifetime。通信使用 durable **Assignment Request**、Session-origin **Assignment Report** 与 Host-origin **Assignment Lifecycle Notice**，而不是 `ctx.subagents.sendMessage()`。Assignment Session 内部仍可使用 DSH-native Subagent。

Assignment Request mode 是 semantic：`context-update` 贡献 durable context 但不唤醒；`next-step` 等到下一个安全 Step；`next-turn` 在当前 Turn 后排一个 continuation。Runtime 把它们映射为 DSH `inject`、`steer` 或 `followup`；普通 request 永不取消 in-flight Tool 或 model step。

SQLite 与 DSH Session Persistence 无法原子 commit。因此 Assignment creation 与 delivery 使用最小的 **Assignment Delivery Intent**：stable id、idempotent acceptance 与 bounded restart reconciliation。它不是通用 queue、workflow engine 或 exactly-once claim。

Assignment Report 携带有意义的 progress、blocked/waiting state、result 与 artifact reference；当它声明 `expects-reply`（Assignment Ask）时，Assignment 结束自己的 turn 等待答复，Orchestrator 用带 `answer_to` 的 Assignment Request 恢复它。创建 Assignment 与投递请求都不阻塞 Orchestrator 的 turn。完整 execution history 留在 DSH。Assignment Lifecycle Notice 携带 Host-derived settlement/error/cancellation fact，并使用独立 provenance。两者都是 immutable Source Event，走普通 Inbox Trigger/Wake Policy path；attention coalescing 可以避免重复 wake，但不能删除任何事实。

当前答复路径只在 DSH 原生 Inbox 接收后清除所捕获的 open ask。冷准备的接收确认与 turn 完成分开；pending 仅表示已安排投递。可证的接收前失败释放 idle wake 名额，保留原问题与权限／模型快照供明确重试；原生 send 结果不明或准备中重启保持 error／修复可见，不自动重放。清除时匹配原 ask ID，旧答复不能抹掉新报告。Human Inbox 和来源详情读取同一 open ask authority，收到 Human DM 本身不表示问题已处理。此切片不新增 Delivery Intent store 或通用重试调度器（#812）。可证的准备拒绝在原 Session failure card 中记录原 `answer_to`；Human 重试读取该已提交 Source Event 与最新 Human 回应，消费一次重试机会，不另存投递状态。

Profile-wide **Assignment Concurrency Limit** 默认是 `3`，只计算正在执行的独立 Assignment Session。超过上限的 create 或 idle-wake attempt 立即失败，并返回结构化 machine field 和 LLM 可读说明。被拒绝的 attempt 不创建 queue、intent 或 dormant DSH Session。

Human 在 Bot 模式设置中调整此上限。DSH 原生 Settings schema 声明 integer volatile field（1–32，默认 8），由 Profile Config Editor 持久化。UI Plugin 的 Host 半侧将 live Volatile reader 绑定到 application-defined Assignment Runtime，绑定随 Fiber dispose 释放。每次 create 或 idle-wake 准入读取当前值，Client 不向 Assignment Tool 传递上限。降低上限不中止已有执行；只有 active use 低于新值后才允许启动新工作。

## Optional Memory capability

Chat、Orchestrator 与 Assignment 的最小执行链只依赖 system-defined base runtime prompt；Persona 与 Memory 都不是 Session role 或启动前置条件。application-defined Memory Service 是独立的 `Consumer → Service Definition → Provider` capability seam。V1 的 Git-backed Provider 可以缺席；缺席时不注册 Memory Tool、不注入 Memory context、也不显示 Client Memory destination，但 DM 与 Assignment 行为保持成立。

Memory Repository 具有独立 identity 与 lifecycle，并通过 attachment 关联 PersonaBot。所有文件都是普通 Markdown：没有 generated/special `MEMORY.md`。如果创建时提供 Persona，Provider 创建普通 `persona.md`；获得写权限的 Agent 或 Human 之后可以像处理其他文件一样修改、改名或删除它，且修改只对尚未生成 persona 快照的 Session 生效（ADR-0060）。

Prompt 组装遵循 ADR-0060：Session 的 system prompt 前缀只可追加。只有静态 role/rule 文本与该 Session 冻结的 persona 快照进入前缀；任何从仓库内容推导出的信息只能作为 tool result 追加到会话末尾，绝不拼接进前缀。不存在 pin state、pin budget、full-body injection 或 generated index，也不存在 `memory_pin`/`memory_unpin` command。

每个 Memory Service command/query 都由 application-defined Cordis Events 包围：`memory/before-operation` 使用 waterfall，可 enrich、rewrite 或 reject；`memory/after-operation` 在 success/failure 后 emit，mutation 只在 durable Git commit 成功后报告 commit id。Event 只携带 repository、operation、actor、cause、path、commit、outcome 等 metadata；Git history 是 durable authority，listener 错过 live Event 后可以查询重建。

## Deep module capability seam

使用小型 command/query interface，不要过早冻结 speculative CRUD：

- **Messaging** 拥有 Source Event ingestion、Channel placement、Reply/Service Action intent、provider routing、provenance、Outbox 与 post-commit fact。
- **Attention/Inbox** 拥有 Inbox Trigger evaluation、Inbox Admission、Attention Unit、Attention Decision、Observation 与 Wake Policy selection。
- **Bot Runtime** 解析 PersonaBot → Orchestrator Session → live/cold Agent，并应用 Delivery Policy。
- **Assignment Runtime** 拥有 Assignment Directory query、Assignment AgentHandle、Assignment Request、Assignment Delivery Intent、report/notice、stop convergence 与 concurrency admission。
- **Memory Service** 是 optional application-defined capability，拥有 generic repository command/query、semantic Git commit 与 operation Event；PersonaBot、Assignment、Tool、UI 和其他 trusted Plugin 都只是 Consumer。

Provider boundary 仍是 capability seam。Feishu Provider 声明 Provider Capability，并解析非 secret account/Chat/Thread reference；Reply 由 Host 根据可信 provenance route，主动 Service Action 则要求匹配的 Service Grant。

## Command、fact 与 event

Command/query 使用 Service；post-commit notification 使用 Event。

```text
Messaging command
-> 按需验证 Messaging Policy / Provider Capability / Service Grant
-> 原子持久化 Source Event、reference、Outbox Intent 与 policy revision
-> commit
-> 发出 live post-commit notification
```

Cordis notification 不是 durable authority。Source Event、Admission、Attention Decision、Assignment Delivery Intent、report/notice、Outbox 与 audit fact 都保留在 operational database 中；Memory operation 的 durable authority 则是成功提交的 Git commit。Memory 的 before/after Event 不能替代 history，也不能让失败的 after-listener 回滚已提交 mutation。

外部 edit/recall event 产生 Source Revision。它们可以更新尚未 Observation 的 Attention Unit，或在 Observation 后产生新的 attention。若 audit/order 很重要，从 provider 读取当前状态不能替代记录已收到的事实。

## Tool 边界

面向 Orchestrator 的 Tool 把 messaging、Inbox 与 Assignment-control capability 适配给模型。Assignment control 恰好是 `list_assignments`、`inspect_assignment`、`create_assignment`、`send_assignment_request` 与 `stop_assignment`；唤醒兼容的 idle Assignment Session 本身就是 Assignment Request，因此不另设 resume tool。面向 Assignment 的 Tool 适配 filesystem、Shell、LSP、web、code runtime 与 DSH Subagent。Assignment Session 获得 `report_to_orchestrator`；其 Subagent 默认不获得。

默认姿态：

- Orchestrator 拥有外部 social identity 与 outbound Channel action；Memory Repository 已接入时默认获得 read-write Memory Tool。
- Assignment Session 只在需要时获得 source-scoped Channel read；默认没有 Memory，Orchestrator 创建它时可以显式授予 `read` 或完整 `read-write`。
- Assignment Session 不获得任意 Bot Inbox 或 top-level Assignment-control authority；v1 的 Assignment-to-Assignment coordination 由 Orchestrator 居中协调，其 Subagent 不自动继承 Memory grant。
- Tool visibility 由 Agent Scope 决定；authorization 仍由 Service Provider 强制执行。

## Persistence 边界

- DSH Session Persistence 拥有 Agent execution SessionEvent。
- 一个 profile-scoped `$DSH_HOME/botharness/botharness.db` 实体拥有全部 BotHarness operational record：PersonaBot registry/Session Ownership、Channel、Source Event/Revision、Admission/Attention、policy、grant、Outbox、Assignment metadata 与 audit。
- Deep module 通过小型 interface 与明确 table ownership 保持分离；caller 永远不拿 generic SQL，也不自行组合 transaction。
- Optional Memory Repository 的 Markdown 与 Git commit、Attachment CAS byte、DSH Session log、credential 与 DSH-native Setting 位于数据库之外，由各自 authority 管理；repository attachment 与 deletion 是不同 lifecycle operation。
- Projection 与 search index 是 derived、可重建数据。
- 外部 side effect 使用 idempotency 与 outbox/reconciliation contract；本地 transaction 无法让外部 provider call exactly once。

Database owner 持有 Profile Writer Lease、串行化 write、拥有唯一 Schema Generation，并且只在 commit 后发出 Cordis notification。`botharness.db` 不是 DSH Storage Domain；复制 live raw file 也不是 backup interface。

## 防止循环

多 PersonaBot 通信需要 deterministic control，例如 causation/correlation/root message identifier、hop count、per-Channel rate limit、cooldown 与 budget。Prompt instruction 可以补充这些控制，但不能替代它们。

## Native/proposed 对照

DSH-native building block：

```text
ctx.agents create/resume 与 Agent delivery method
ctx.subagents delegation API
ctx.tools scoped Registration/restriction
Workspace registry 与 Session attachment
Session、SessionEvent、Session Persistence、Projection
```

BotHarness-proposed layer：

```text
Messaging、Attention/Inbox、Bot Runtime、Assignment Runtime capability seam
optional application-defined Memory Service Definition/Provider/Event
PersonaBot/Channel/Source Event/Inbox Admission/Attention Decision
Inbox Trigger/Wake Policy/Delivery Policy
Orchestrator Session 与 Assignment Session 产品角色
Assignment Directory/Continuity Key/Assignment Request/Assignment Report/Assignment Lifecycle Notice
botharness.db operational authority 与 model-facing Tool
```

讨论上游不存在的 API 时，必须始终保留 proposed 标签。
