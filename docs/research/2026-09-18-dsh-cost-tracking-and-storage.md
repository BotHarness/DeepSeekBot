# DSH 用量与成本追踪调研 — 每 PersonaBot 成本/用量可视化的数据来源与存储决策

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 问题       | ① DSH（DeepSeek Harness）到底暴露了哪些用量数据、形状如何、是否存在现成的「成本」字段？② 每 PersonaBot 的成本/用量看板应从哪读、要自己算什么？③ 在 local-first Node 插件里，这类 append-only 账目应存哪：DSH 会话日志按需派生 / SQLite / DuckDB / 纯文件？                                                                                                                                                                                                                             |
| 上游仓库   | https://github.com/deepseek-ai/deepseek-harness（文档站 https://deepseek-harness.github.io/deepseek-harness/）                                                                                                                                                                                                                                                                                                                                                                         |
| Pinned SHA | `ddefc45fbc7f8e46dd73185e68295696d1297887`（2026-09-17 21:19 +0800，release `dsh-0.1.6-alpha.2`；本仓库当前 pin `0.1.5-rc.2`）。以下 `docs/...`、`packages/...` 路径均相对该 SHA，经 `raw.githubusercontent.com` 于 2026-09-18 读取                                                                                                                                                                                                                                                    |
| npm 快照   | 2026-09-18：`@deepseek-ai/dsh` dist-tags `latest = 0.1.5-rc.2`、`alpha = 0.1.6-alpha.2`；社区参照 `@skkjkk/dsh-usage-dashboard@0.3.10`、`@angelyeye/dsh-cost-tracker@1.8.11`、`dsh-context@0.53.3`、`dsh-whale-widget@0.3.5`；存储候选 `@duckdb/node-api@1.5.5-r.5`（平台原生包 unpacked ≈ 38 MB）、`duckdb@1.4.4`（≈ 61 MB）、`better-sqlite3@13.0.3`（≈ 27 MB）                                                                                                                      |
| 调研方法   | 一手优先：GitHub code search（`gh search code`/`gh api`）逐文件读上游文档与源码（本机无 checkout）；社区插件只读 GitHub README/npm 元数据，作为「先例」而非机制事实；本仓库读 ADR-0005、`docs/botharness.md` §4/§5、`packages/core/src/state/bot-state.ts`、`docs/client-bridge.md`。无法由一手来源确认的说法标注「未验证」。本次**未安装/运行任何插件**，唯写本文件                                                                                                                   |
| 一句话结论 | **DSH 只提供 token 计量（provider 精确 usage + 启发式估算），从不计算货币成本，也没有任何 pricing/billing 字段。** 成本必须由我们按「模型 × 计费时代 × 峰谷」的价目表自行推导，且可重算。数据源首选 Host 侧 `session/event` + `tokenUsage` 投影（会话内权威、跨会话需自聚合）；存储上建议 **DSH 会话日志继续做唯一事实源、我们只持久化「token 桶的日级汇总」到 DSH `storageDomain`（优先 `json` 后端，量上来切 `sqlite`）**，不引入 DuckDB 这类携带平台原生二进制的分析引擎（详见 §4） |

---

## 1. 数据来源与其精确形状

### 1.1 最底层事实：provider 上报的 `TokenUsage`

DSH 每个模型调用的用量是**四个互斥桶**，由 adapter 从 provider 响应归一化而来；缓存字段可缺省。`inputTokens` **只含未命中缓存的输入**，计费输入 = 三个输入桶之和。

```ts
// docs/subsystems/llm-streaming.md（源：packages/llm/llm/src/types.ts）
interface TokenUsage {
  inputTokens: number; // 未命中缓存的输入（disjoint）
  outputTokens: number; // 输出；reasoning 已含在内
  totalTokens?: number; // 精确 prompt+output 总量，可缺省
  cacheReadTokens?: number; // 缓存命中读取
  cacheWriteTokens?: number; // 缓存写入
  reasoningTokens?: number; // 信息性，禁止在合计里再加一次
}
```

Provider 精确值只随流式协议的 `usage` chunk 到达；**一个失败的调用也可能没有 usage**（文档明确 usage 可为 absent）。这是「账单级」的唯一数据。

### 1.2 承载事件：会话日志（append-only 事件流）

usage 跟随 assistant 结算事件落盘，且重试/失败尝试也保留计费痕迹（关键差异点，见 §2.3）：

| 事件（`SessionEventMap`）                             | 形状（节选）                                               | 与用量的关系                                                                                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `assistant/message`                                   | `{ turn, step, message, stream, usage?, interrupted? }`    | **顶层 `usage?: TokenUsage` 是已提交消息的权威值**；`stream` 为紧凑的精确流（含 usage chunk 证据）                                   |
| `assistant/attempt`                                   | `{ turn, step, stream }`                                   | 未产生面消息的失败/重试/取消尝试；**token 记账会展开其内嵌 stream**，可能含 usage                                                    |
| `request/header`                                      | `{ header: EpochHeader, reason, startsSeries? }`           | `header.config: LlmCallConfig` 携带 `provider / model / reasoningEffort / temperature / maxTokens / stop`；模型切换会追加新快照      |
| `request/context`                                     | `{ provider, model, contextWindow?, systemPromptUpdate? }` | 路由元数据（容量等），同一步内与 `request/header` 并列，仅变化时追加                                                                 |
| `llm/retry` / `llm/retry-started`                     | 见 `packages/llm/llm-retry`                                | 每次重试 = 一次新的 provider 请求，**可能重复计输入费用**；投影用 `llm/retry-started` 结束同一步的替换范围，使重试贡献另一次计费尝试 |
| `session/end-seed`                                    | `{ inherited?: true }`                                     | fork/恢复边界；**fork 子会话日志包含父前缀**，全量求和会重复计数（见 §5）                                                            |
| `turn/start` / `turn/end` / `step/start` / `step/end` | 结构事件                                                   | 时间与归属锚点；`sessionStats` 投影据此计数                                                                                          |

每调用的**模型归属**有两条独立来源：`assistant/message.message.source`（`AssistantProviderMetadata = { provider, model, replayState? }`，随消息走）与当时的 `request/header` 快照；会话中途换模型两者都可追踪。

### 1.3 会话累计投影：`tokenUsage`（现成的「按会话合计」）

`@deepseek-ai/dsh-token-meter` 在组合提供 `ctx.sessionProjections` 时注册三个客户端可见投影键（源：`packages/llm/token-meter/src/projection.ts`）：

| 投影键             | 形状                                                                       | 语义与边界                                                                                                       |
| ------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `tokenUsage`       | `{ uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }` | **完整持久日志的 provider usage 累计**（跨 compaction 不变）——按会话的权威合计；但**不区分模型、无每次调用明细** |
| `contextPressure`  | `{ pressureTokens?, projectedTokens?, contextWindow? }`                    | 最新一次 provider 报告的 prompt 规模 + 启发式外推；文档明确「用户参考，**不是 billing 或 gating 输入**」         |
| `contextBreakdown` | `{ systemTokens, toolsTokens, messageTokens }`                             | 固定密度启发式，用于上下文构成；与计费口径**不可混用**                                                           |

另有一个独立的 `ctx.tokenMeter.measure(session, requestHeader?)` 同步接口，返回 `TokenMeasurement`（`logRevision / baseline / surfaceDeltaTokens / totalTokens / surfaceTokens / nodes`），用于压力/位置计价；其 README 明确「需要**精确账单级计数**时应改用 provider tokenizer」，即 **measure() 不是账单**。

官方 UI 的口径可直接抄：`packages/client/ui-chat/src/client/chat/StatsPills.tsx` 中
`billedInput = uncachedInputTokens + cacheReadTokens + cacheWriteTokens`，总 token = `billedInput + outputTokens`，缓存命中率 = `cacheReadTokens / billedInput`。

### 1.4 历史/离线的读取面

- **持久化**：会话日志为 append-only 逻辑 JSONL（默认 Zstd 帧 + 校验和），经 `ctx.sessionPersistence` 的 per-session `SessionHandle.read(offset, length)` 读取；`stat/list` 提供 `revision / eventCount? / sizeBytes?`（源：`docs/subsystems/persistence.md`）。
- **跨会话查询**：`ctx.sessionQuery` 提供 `listSessions / readSession / listEvents / filterEvents / readSurface / traceSession` 等（源：`docs/subsystems/session-query.md`），可以按会话/事件批量读，但没有「按模型/按 Bot 的 token 聚合」。
- **投影缓存**：`ctx.sessionProjectionCache` 把各投影单元（含 `tokenUsage`）持久化到 DSH 自有的 `session_projcache` 域（`per-record` 布局），`cachedSnapshot()` 可零 I/O 列出某会话的合计（可能滞后至上次 checkpoint）。可作为**冷启动时的合计旁路**，但不能替代明细。
- **Session Header**（归属元数据）：`id / createdAt / cwd / parentSession / isSeeded / origin: 'subagent' / delegationDepth / agentPreset`——这是把会话归到 PersonaBot / 子代理 / workspace 的现成键。
- 实时面：Host 可订阅同步 firehose `session/event`（构造 seed 不发）；重试等实时观测点还包括 `llm/stream` waterfall 与 `agent/request`（源：`docs/architecture.md`、`docs/event-producer-consumer.md`）。**没有**官方转发到第三方客户端的事件白名单（`docs/client-bridge.md` §4 已记录）。

### 1.5 「DSH 不算钱」的证据

对上游全仓 code search：`cost` 命中集中在性能/复杂度语境，`billing` 仅出现在 CI 计费与文档注释，**没有任何 `costUsd`/金额字段、价目表、汇率或 provider pricing（货币级）API**。唯一的「pricing」是 `imageRequestPricing`（把图片换算成**视觉 token**，仍不是钱）与压缩用的「shadow price」（token 级影子价）。**结论：货币成本 100% 由消费方（插件/看板）自己定义与计算。**

---

## 2. 必须由我们计算的部分

### 2.1 价目表（真正的成本函数参数）

需要一张按 **provider × model × 时间生效区间** 分版的价格表，并且要处理：

- **峰谷**：DeepSeek 工作日 9:00–12:00 / 14:00–18:00（北京时间）高峰，其余（含周末）闲时 = 高峰半价；
- **计费时代**：官方调价/模型路由按日期切换（社区先例：2026-09-10 V4.1 Flash 新价、2026-09-14 V4-Pro 才路由过去）；
- **模型别名**：`deepseek-flash` / 旧 `deepseek-v4-flash*` 等归一到同一档价；
- **缓存桶映射**：DSH 的 `cacheWriteTokens` 是独立桶，但 DeepSeek 现行规则下缓存写入与缓存命中同价（`@angelyeye/dsh-cost-tracker` v1.4.1 的修复结论）；这是 provider 特定的，需在表里显式声明；
- **币种与汇率**：社区插件用 CNY，亦有 USD（models.dev）；跨 provider 时需统一结算币种。

社区参照表（**非官方一手，落地前必须按官方价格卡复核**）：V4.1 Flash 高峰 `缓存命中 0.04 / 未命中 2 / 输出 8`（元/百万 token），闲时半价 `0.02 / 1 / 4`（`dsh-cost-tracker` v1.6.0 changelog、`dsh-whale-widget` README `PRICING`）。

### 2.2 一次调用的成本公式（可重算）

```
billedInput = input + cacheRead + cacheWrite            // DSH 的计费输入定义
totalTokens = billedInput + output                      // reasoning 已含在 output，不再加
cost = Σ_bucket  tokens_bucket × price(provider, model, era, peak, bucket)
cacheHit% = cacheRead / billedInput
```

要点：**只持久化桶（事实）+ 时间戳 + provider/model；成本在查询时用当前价目表重算**。价目表换版/修正时无需迁移数据，等价于社区插件的 `cost_recompute`（`dsh-cost-tracker`）。若为审计需要冻结当时金额，则额外存 `cost + pricingVersion`，并保留重算开关。

### 2.3 归属与口径陷阱（必须在实现前定死）

| 陷阱          | 事实                                                                                                                  | 影响                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 重试/失败尝试 | `llm/retry` = 新请求；`assistant/attempt` 也可能带 usage；provider 可能已计费                                         | 只统计 `assistant/message.usage` 会**少计**；应复用/复刻 token-meter 的替换语义 |
| fork/恢复     | fork 子会话日志含父前缀（`session/end-seed`、`inheritedEventCount`、`isOwnSeq`）；`tokenUsage` 投影按**完整日志**累计 | 跨会话求和会**重复计数**；账目必须只累加本会话自有 seq                          |
| 子代理        | session header 有 `origin:'subagent'`、`parentSession`、`delegationDepth`                                             | 归到父 PersonaBot 还是单列，是产品决策                                          |
| 辅助调用      | `GenerateOptions.purpose: 'compaction' \| 'session-title'` 等冻结辅助调用也真实花费                                   | 是否计入 PersonaBot 成本需明确（建议计入，可单列）                              |
| 中断/取消     | 部分流式输出可能无 usage，只有已交付前缀                                                                              | 无 usage 的调用如何估算（或标注 unknown），要定策略                             |

---

## 3. 现有插件先例（2026-09-18 快照）

| 插件                                            | 数据来源                                                                                                                      | 存储                                                                                                                                                         | 计费/口径                                                                                                | 对我们的含义                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@skkjkk/dsh-usage-dashboard@0.3.10`            | `session/event` 增量 + 启动时 `persistence.readFrom` 一次全量 fold；活跃会话读内存对象                                        | **无持久化**：`src/core/rollup.js` 内存按小时桶，60s reconcile，查询带 TTL 缓存；偏好存 localStorage                                                         | 自带 245 模型价目 CSV（生成进 bundle），DeepSeek 峰谷；支持模型/项目（会话 cwd）拆分、缓存覆盖率分离口径 | 「按需派生 + 内存 rollup」在功能上完全够用；我们若加持久化，应只补它缺的**跨重启/跨会话归属**                   |
| `@angelyeye/dsh-cost-tracker@1.8.11`            | Host 侧采集（含 `llm/stream` 粒度），每调用一条记录                                                                           | **单 JSON 文件** `~/.dsh/storages/cost-tracker-records.json`：明细留 180 天，更早折叠为**永久日汇总**；tmp+rename 原子写、重试；日汇总用 `purpose=rollup` 行 | 计费时代分版 + 峰谷 + 模型路由 + cacheWrite 按命中价；`cost_recompute` 补账；订阅等效费用单列            | **与我们最接近的产品形态**（每 Bot ≈ 每订阅/维度），其「明细 + 永久日汇总」与「成本可重算」是直接可抄的账本模型 |
| `Clowrain/dsh-token-usage-plugin`               | `session/event` 实时 + 延迟历史扫描（按 seq 去重）                                                                            | **SQLite** `~/.dsh/plugins/dsh-token-usage-plugin/usage.db`                                                                                                  | models.dev 单价换算（可手动同步）；热力图/趋势/环形图                                                    | 证明「插件自带 SQLite 文件」可行；但引入了自有 DB 生命周期与迁移责任                                            |
| `FuQiZuo/DSH-Token-Meter`                       | 纯客户端读 `tokenUsage` 投影；实时用本地分词器预览                                                                            | 无（localStorage 设置）                                                                                                                                      | 输入=三桶之和、命中、未命中；实时值仅预览，结束后校准                                                    | 投影口径的官方对齐例；也说明**客户端无法拿到 per-call 明细**                                                    |
| `bowenliang123/dsh-context@0.53.3`              | token-meter 投影（`contextPressure`/`contextBreakdown`）+ 会话日志；跨会话 Context Dashboard                                  | README 未声明持久化（按需计算）                                                                                                                              | 费用按 models.dev 列表价估算，DeepSeek 峰谷感知                                                          | 「跨会话仪表盘」的产品参照：KPI 带 + 热力图 + 会话卡片                                                          |
| `MeteorNOX/DeepSeek-Balance-Whale-Widget@0.3.5` | 每轮 `session/event` 真实 usage + **DeepSeek 余额 API** `GET https://api.deepseek.com/user/balance`（凭据走 DSH credentials） | `$DSH_HOME` 下多个 JSON 账本 + 归档（明细 90 天/2 万条、日汇总 365 天、金额 8 位小数）                                                                       | 峰谷；「已观测消费」= 余额差（账户口径），「本机模型费用」= 本地估算（分开记）                           | 账户级真实花费可由余额差获得，但**无法归属到 PersonaBot**；两者应分开展示，避免混淆口径                         |
| `Angelyeye/dsh-cost-cloud`                      | 接收各设备/agent 的 HTTP 上报（开放 INGEST 契约）                                                                             | **`node:sqlite`**（零 npm 依赖，Node 内置）                                                                                                                  | 内容哈希 `dedupKey` 幂等、日汇总快照 + `absorbed` 墓碑、设备×Agent 矩阵；插件侧本地先记后增量上报        | 未来云端的参照；也再次验证 **`node:sqlite` 足够承载这类账目**                                                   |

共同点：**没有任何一个插件从 DSH 拿到现成成本**；全部自备价目表，全部把「provider usage 桶」当事实，把「金额」当派生物。

---

## 4. 存储选型

### 4.1 需求（查询模式）与约束

- 查询：每 PersonaBot 的 今日/本月/全部 合计、按天时间序列、**按模型拆分**、缓存命中率、最近调用明细（下钻）、子代理/workspace 维度。
- 写入：来自 Host 事件流（每次 assistant 结算），中等频率、点状；应与 Host 主路径解耦，不能阻塞 turn。
- 约束：DSH 插件 bundle 的依赖重量与跨平台；ADR-0005「SQLite 只是可选索引，绝不是系统记录」；DSH 会话日志已经持有最细粒度事实（usage + model + 时间 + 归属）。
- 当时的 ADR-0005（[现行持久化决策](../decisions/persistence.md#adr-0005)）：SQLite 仅用于基础插件未覆盖处（bot registry、chat→session 绑定、去重、出站队列），且引入时必须遵守版本化迁移 / 完整性检查 / `VACUUM INTO` 备份纪律。

### 4.2 对照表

| 方案                                                        | 写路径                                                                                      | 查询能力                                                                                                                               | 依赖/包体                                                                                                                               | 迁移/并发                                                                                 | 与 ADR-0005/事实源的关系                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| (a) 按需从 DSH 会话日志派生（不新增存储）                   | 零写入；仅在需要时读 `sessionQuery`/`SessionHandle`，冷会话日志是 Zstd JSONL，需逐事件 fold | 全量扫描 + 内存聚合；单次全量成本随会话数×事件数增长；进程重启后需重算；可用 `session_projcache` 拿会话合计，但**无跨会话/按模型聚合** | 零新增依赖                                                                                                                              | 无迁移；读句柄与 Host 写句柄并存安全（单写者 + 只读 handle）                              | 完全符合「DSH 日志是事实源」；缺点是每次查询 O(历史)                                           |
| (b) **SQLite**（经 DSH `ctx.storageDomain`，`sqlite` 后端） | 每条/每汇总行一次写；domain 写链串行、`node:sqlite` 同步单语句原子                          | 索引范围查询、分组聚合、时间序列 SQL 都是强项；本地规模（万级行）绰绰有余                                                              | **零新依赖**：DSH 已用 `node:sqlite`（`storage-sqlite` 后端）；无需 better-sqlite3                                                      | domain 有 `version`/`compatibleVersions`/zod schema/`per-record` 布局；跨进程不在域层范围 | 我们是**派生索引**（事实仍在 DSH 日志），正落 ADR-0005 的允许范围；若引入即复用 DSH 的迁移纪律 |
| (c) DuckDB                                                  | 列存 append，批量写友好                                                                     | OLAP 聚合最快，但我们的数据量（个人 PoC）根本不需要                                                                                    | `@duckdb/node-api` 需平台原生包（win32-x64 unpacked ≈ 38 MB，含多平台则为插件包增重数十 MB）；native binding 跨平台/Node ABI 跟版成本高 | 无内置迁移；版本升级需跟原生包                                                            | 明显违背「薄插件 + 不增重」的项目约束；**否决**                                                |
| (d) 纯文件（NDJSON/JSONL，或单 JSON + 原子替换）            | `appendFile` 最简单、崩溃安全（追加行）或 tmp+rename；人可读可 diff                         | 查询=全量读入内存再聚合；时间序列/分组要么每次扫、要么自建内存索引；单文件方案写放大（社区插件用「明细 + 日汇总」缓解）                | 零依赖                                                                                                                                  | 无迁移框架；频率高时需自己管并发/紧凑                                                     | 适合做**明细日志**与导出；不适合做多维时间序列的唯一介质                                       |

### 4.3 建议（可落地的最小方案）

1. **事实源不动**：DSH 会话日志（含 provider usage、model、时间戳、session header 归属）继续是唯一系统记录；我们不复制 prompt/内容，只复制「桶」。
2. **只持久化日级 token 汇总**：domain 记录键 `(botSlug, dayUTC8, provider, model, purpose)`，值 = 四个 token 桶 + `count` + `lastSeq`/`sessionHighWatermark`。写入幂等（`update()` 累加），每天每模型常量级行长；成本在查询时按 §2.2 重算。这样既支撑「按 Bot/按天/按模型」全部查询，又把写频率压到最低，两个 DSH 后端（json/sqlite）都无压力。
3. **明细不落我方盘**：最近调用明细（下钻）按需从 DSH 日志/`session_projcache` 派生（或缓存进内存），避免账单式永久明细带来的保留期与隐私问题。
4. **后端选择**：PoC 默认 `json`（可读、可备份、无需任何原生件）；当 profile 已启用 `@deepseek-ai/dsh-storage-sqlite` 或写入频率上来时，仅改 domain 路由到 `sqlite`，不改 domain spec。**不新增任何 npm 依赖**（尤其不引入 better-sqlite3/DuckDB）。
5. **重建能力**：domain 行携带 `lastSeq`/水位与 `pricingVersion`（可选）；删除 rollup 后可从会话日志重放重建，符合「派生索引」定位。若未来上云，参照 `dsh-cost-cloud` 的幂等 `dedupKey` 契约。

> 一句话：**(a) + 小型 (b) 的混合**——日志按需派生、日级 rollup 持久化；DuckDB 与「每调用一条明细长期落盘」都否决。

---

## 5. 开放问题（需人决策）

1. **价目表来源与维护**：内置 JSON（随包发布，跟版升级）还是同步 models.dev / 官方价格卡？币种（CNY 为主，是否支持 USD+汇率）？峰谷与计费时代（2026-09-10 / 09-14 类切换）由谁在何时更新？——先例分歧：`dsh-cost-tracker` 内置、`dsh-token-usage-plugin` 可同步。
2. **计入口径**：失败/重试尝试（provider 可能已计费）是否计入；`purpose = compaction / session-title` 等辅助调用是否计入 PersonaBot 成本；中断流无 usage 时标记 unknown 还是启发式估算。
3. **归属语义**：fork 子会话重复计数如何消（只算 `isOwnSeq`）；subagent 归父 Bot 还是单列；孤儿/未绑定 PersonaBot 的会话归「未分配」还是忽略；PersonaBot 删除后账目保留（rakazo 的 UsageRecord 与 Bot 生命周期解耦）还是随删。
4. **持久化粒度与介质**：采用 §4.3 的「日级 rollup」还是每调用明细（审计 vs 成本）；是否扩展 ADR-0005 的适用范围或新写 ADR 记录 usage ledger；保留期与 `VACUUM INTO`/归档策略（若 sqlite）。
5. **展示面与桥**：看板落在 roster 详情页、`main` 面板还是 Settings 页；客户端桥新增 `botharness/usage` 只读方法的入参/出参形状；按 `docs/client-bridge.md` 先做「动作后刷新 + 低频轮询」还是等 SSE（当前结论：不需要实时）。
6. **账户余额口径**：是否同时接 DeepSeek `GET /user/balance`（真账户口径，无法按 Bot 归属）与本机估算，并在 UI 上区分两者（`dsh-whale-widget` 的做法）。
7. **隐私与导出**：用量属于元数据，是否进 SoulSnapshot/`M6` 导出、是否随云端同步（`dsh-cost-cloud` 先例）；会话脱敏开关是否默认开。

---

## 6. 参考（访问日期均为 2026-09-18）

- 上游文档（pinned SHA `ddefc45…`）：`docs/subsystems/token-meter.md`、`token-meter.zh.md`、`docs/subsystems/llm-streaming.md`、`docs/subsystems/session.md`、`docs/subsystems/persistence.md`、`docs/subsystems/session-projection.md`、`docs/subsystems/session-query.md`、`docs/subsystems/storage.md`、`docs/architecture.md`、`docs/event-producer-consumer.md`、`docs/api-gateway.md`
- 上游源码：`packages/llm/token-meter/src/projection.ts`、`packages/llm/llm/src/types.ts`、`packages/client/ui-chat/src/client/chat/StatsPills.tsx`、`packages/storage/storage-sqlite/README.md`、`packages/session/session-stats/README.md`、`packages/llm/llm-retry/README.md`
- 本仓库：[ADR-0005](../decisions/persistence.md#adr-0005)、`docs/botharness.md` §4/§5、`packages/core/src/state/bot-state.ts`、`docs/client-bridge.md`、`docs/research/2026-09-17-rakazo-architecture.md`（UsageRecord 先例）
- 社区插件：`@skkjkk/dsh-usage-dashboard`、`@angelyeye/dsh-cost-tracker`、`Angelyeye/dsh-cost-cloud`、`Clowrain/dsh-token-usage-plugin`、`FuQiZuo/DSH-Token-Meter`、`bowenliang123/dsh-context`、`MeteorNOX/DeepSeek-Balance-Whale-Widget`（npm/GitHub README 快照）
