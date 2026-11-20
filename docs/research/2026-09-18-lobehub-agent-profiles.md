# LobeHub Agent/Profile 设计调研 — 模型绑定、技能/MCP、记忆与分享（对照 BotHarness）

## 0. 元信息

| 项         | 内容                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上游       | https://github.com/lobehub/lobehub（约 82k stars；LobeChat 主仓库）                                                                                                                                                                                                                                                                      |
| Pinned SHA | `b0ef4b2ef15d61b0be43bfa6f39d3524405ce374`（2026-09-18 13:56:18 +0800，`⬆️ chore: upgrade actions/checkout to v7 (#19656)`）                                                                                                                                                                                                             |
| 克隆路径   | `reference/lobehub/`（shallow clone，只读；`reference/` 已在 `.gitignore` 中）                                                                                                                                                                                                                                                           |
| 许可       | **LobeHub Community License**（基于 Apache-2.0 + 附加条件：a) 不修改源码可商业使用；b) 基于它开发/分发衍生作品需商业授权）（`reference/lobehub/LICENSE:1-17`）。注意 `package.json:23` 写的是 `"license": "MIT"`，与 `LICENSE` 文件冲突——**以 `LICENSE` 为准**（prose 与 code 冲突时 code 胜）。结论：**仅可做架构研究，不要复制代码**。 |
| 日期       | 2026-09-18                                                                                                                                                                                                                                                                                                                               |
| 调研方法   | 只用一手来源：仓库源码（Drizzle schema、types、context-engine、server services）+ 仓库自带 `AGENTS.md`。所有行号均指 pinned SHA 下的克隆；未能在源码中确认的说法一律标「未验证」。若克隆不在场，可用 `https://github.com/lobehub/lobehub/blob/b0ef4b2ef15d61b0be43bfa6f39d3524405ce374/<path>#L<n>` 复核。                               |
| 复现       | `git clone --depth 1 https://github.com/lobehub/lobehub reference/lobehub && git -C reference/lobehub rev-parse HEAD`；未运行 `pnpm/bun install/build/test`，未启动任何服务。                                                                                                                                                            |

对照的本地规格：`PRD.md`、`docs/botharness.md`、`GLOSSARY.md`、`docs/adr/0001`–`0026`、`docs/architecture/botharness-architecture.md`。

## 1. 一句话定位与技术栈

LobeHub 是一个**全栈 AI Agent 产品**（LobeChat）：Next.js 16 + React 19 + TypeScript、Postgres + Drizzle ORM、TRPC/Hono backend、Electron 桌面端与 CLI（`reference/lobehub/AGENTS.md:5-7,17-25`；`package.json:2-3`）。它不是插件层，而是「自带账号、数据库、市场、客户端」的独立平台——与 Rakazo 同类，与我们「DSH 内插件层」的根本形态不同（ADR-0015）。

它的 "agent"（早期叫 assistant）就是一个 **DB 行**（`agents`）+ 若干关联表；"agent 市场/分享/fork/小组" 全部围绕这行配置展开，**记忆与知识不在 agent 行里**（见 §4、§6）。

## 2. Agent/profile 模型

### 2.1 核心表与类型

`agents` 表是唯一事实源（`reference/lobehub/packages/database/src/schemas/agent.ts:36-129`）。三个挂载表：

| 表                       | 作用                                 | 引用                                                  |
| ------------------------ | ------------------------------------ | ----------------------------------------------------- |
| `agents`                 | agent 配置与归属（JSONB 为主）       | `schemas/agent.ts:36-129`                             |
| `agents_knowledge_bases` | 挂载知识库（含 `enabled` 开关）      | `schemas/agent.ts:145-169`                            |
| `agents_files`           | 挂载文件（含 `enabled` 开关）        | `schemas/agent.ts:171-195`                            |
| `sessions`（legacy）     | 已弃用的 1:1 会话壳；新代码用 topics | `schemas/session.ts:78-112`；`schemas/topic.ts:27-54` |

TypeScript 侧有两条线：`LobeAgentConfig`（运行时/客户端 config，含 `knowledgeBases?`、`files?`，由服务端 enrichment 填充，`packages/types/src/agent/item.ts:27-115`）与 `AgentItem`（DB 行投影，`item.ts:157-205`）；`CreateAgentSchema` 是创建入口（`item.ts:124-154`）。

### 2.2 配置字段总表

| 分组           | 字段（DB 列 / JSONB key）                                                                                                                                | 落点                                                       |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 身份           | `name`（个人名）、`title`（角色名）、`description`、`avatar`、`backgroundColor`、`tags[]`、`profile`（角色卡）、`societyId`（Agent 组织）                | `schemas/agent.ts:44-72`；`types/agent/profile.ts:60-97`   |
| 人格           | `systemRole`（系统提示词）；`openingMessage`、`openingQuestions[]`；`fewShots`；`editorData`（富文本）                                                   | `schemas/agent.ts:90,96-97,86,52`                          |
| 模型           | `model`、`provider`、`params`（LLMParams）                                                                                                               | `schemas/agent.ts:87-89`                                   |
| 模型参数       | `chatConfig`：`thinking`/`reasoningEffort`/`thinkingBudget`/`enableStreaming`/`enableHistoryCount`/`historyCount`/各模型专属 effort 等约 90 个键         | `types/agent/chatConfig.ts:27-207`                         |
| 工具           | `plugins`（JSONB，见 §3.2）                                                                                                                              | `schemas/agent.ts:74`；`types/agent/pluginConfig.ts:12-23` |
| 技能开关       | `chatConfig.skillActivateMode`（`auto`/`manual`）、`chatConfig.toolMode`（`agent`/`chat`/`custom`）                                                      | `types/agent/chatConfig.ts:162-168,184-191`                |
| 知识           | `agents_knowledge_bases`、`agents_files`（join 表）                                                                                                      | `schemas/agent.ts:145-195`                                 |
| 记忆           | `chatConfig.memory{enabled,effort,toolPermission}`——**开关在 agent，数据不在**                                                                           | `types/agent/chatConfig.ts:13-19`                          |
| 上下文/压缩    | `enableContextCompression`、`compressionModelId`、`disableContextCaching`、`toolResultMaxLength`                                                         | `types/agent/chatConfig.ts:28-44,192-197`                  |
| 搜索           | `searchMode`/`urlContext`/`useModelBuiltinSearch`/`searchFCModel`                                                                                        | `types/agent/chatConfig.ts:159-161,204-206`                |
| 语音           | `tts`（`ttsService`/`voice.openai`/`sttLocale`）                                                                                                         | `schemas/agent.ts:91`；`types/agent/tts.ts:3-10`           |
| 执行（agency） | `agencyConfig`：`executionTarget`、`boundDeviceId`、`localSandbox`、`heterogeneousProvider`、`graph`、`subagent`、`verifyRubricId`、`workingDirByDevice` | `types/agent/agencyConfig.ts:923-1057`                     |
| 归属/可见性    | `userId`、`workspaceId`、`visibility`（workspace 内 `private`/`public`）、`marketIdentifier`、`sessionGroupId`、`pinned`、`virtual`                      | `schemas/agent.ts:55,78-81,99,109`                         |

**AgentProfile（角色卡）** 是一个 JSONB 小包：`mbti`、`zodiac`、`gender`、`personaTraits[]`、`artworkDirection`、`fullBodyArtwork` 等——源码注释明确「traits are hints … never switches that change behaviour」（`types/agent/profile.ts:51-97`）。即 lobehub 把「性格/设定」与「行为提示词 `systemRole`」分开存。

### 2.3 配置的组装（enrichment）

客户端/运行时拿到的 config 是 `agents` 行 + join 表拼出来的：`enrichAgentWithKnowledge()` / `getAgentAssignedKnowledge()` 把 KB 列表附到 config（`packages/database/src/models/agent.ts:770-830`）；`plugins` 则经三态 helper 解析（§3.2）。**config 与「记忆/会话历史」完全解耦**。

## 3. Bindings：模型、工具/插件、MCP

### 3.1 模型绑定

- Agent 只存 `model` + `provider` 两个字符串；参数在 `params` + `chatConfig`（`schemas/agent.ts:87-89`）。
- Provider 凭据**不落在 agent**：`ai_providers`（`key_vaults` 加密列）与 `ai_models` 按 `user_id` / `workspace_id` 作用域（`packages/database/src/schemas/aiInfra.ts:21-76,78-135`）。
- 解析优先级集中在 `resolveAgentModelConfig`：`显式 per-run override > 允许的成员 override > agent 共享模型`（`packages/types/src/agent/modelSelection.ts:65-83`）。
- Workspace Agent 有 `modelSelectionPolicy`（`fixed`/`member`）——共享 agent 可允许每个成员用自己的模型（`types/agent/agencyConfig.ts:899,991-997`）。
- 另一种「模型绑定」是 **heterogeneous provider**：agent 可把执行转交给外部 CLI（Claude Code、Codex、Cursor、opencode、pi、grok-build…），存 `command/args/model/effort/mode/speed/env/systemContext`（`types/agent/agencyConfig.ts:182-253`）。

### 3.2 工具/插件（MCP 之外）

- `agents.plugins` 是 `AgentPluginEntry[]`：`string | { identifier, mode }`；`mode ∈ pinned|auto|disabled`，缺省 `auto` 表示「用户已装池里默认可用」、`pinned` 表示显式启用、`disabled` 表示显式停用（`types/agent/pluginConfig.ts:12-63`）。
- 运行时用 `getActivePluginIds()`（= pinned 集合）喂给 `ToolsEngine.generateTools()`；manifest 池里有内置工具、市场插件、MCP、自定义插件（`packages/context-engine/src/engine/tools/ToolsEngine.ts:55-92`）。
- 工具声明是 `ToolManifest`：`identifier + api[] + meta + type(builtin|default|markdown|mcp|standalone)`，可选 `settings`（参数表单）与 `systemRole`（工具自带提示词）（`packages/types/src/tool/manifest.ts:19-58`）。
- 旧表 `user_installed_plugins` 已标注 deprecated，仅存旧行（`schemas/connector.ts:365-387`）。

### 3.3 MCP servers

MCP 的连接参数存在 `user_connectors`（`packages/database/src/schemas/connector.ts:167-238`）：

- 连接方式 `mcpConnectionType ∈ http|stdio|cloud`（`:94-101`）；`mcpServerUrl`；stdio 的 `mcpStdioConfig{command,args,env}`（`:194-203`）；OAuth/OIDC 配置与**加密凭据**列（`:210-215`，AES-GCM）。
- **Agent 维度挂载**：`agentId` 列为 agent 专属连接器（`:177-185`）；另有 `metadata.mountedByAgentId` 表示「用户拥有、被某 agent 挂载锁定」的连接器（`:141-149`）。解析优先级注释写明 **Agent > Workspace > Personal**（`:177-185`）。
- 每个连接器下有 `user_connector_tools` 完整工具表（manifest 同步），权限三态 `auto/needs_approval/disabled`（`:256-260,282-360`）。
- 与 Rakazo 对照：lobehub 的 connector 同时覆盖 MCP、内置与 Composio（`schemas/connector.ts:103-129`），审批粒度落在「单工具权限」而不是 Rakazo 的 effect ledger。

### 3.4 IM / Bot 绑定

`agent_bot_providers` 按 agent 绑定外部聊天平台：`platform`（含 `feishu`）、`applicationId`、加密 `credentials`、`settings`（dm policy、charLimit、debounce…）、`enabled`；`platform+applicationId` 唯一，用于 webhook 反查 agent（`schemas/agentBotProvider.ts:18-63`）。这是与我们 DeepSeekBot IM adapter 最直接可比的表。

## 4. 记忆与知识

### 4.1 用户记忆（user-scoped，**不是 agent-scoped**）

- 基表 `user_memories` 只有 `user_id`，**没有 `agent_id`**；分五层：`activity / context / preference / identity / experience` 各有子表（`packages/database/src/schemas/userMemories/index.ts:7-48,50-330`）。向量列 `vector(1024)` + HNSW 索引（`:38-45`）。
- 记忆由**后台 LLM 流水线自动抽取**：`MemoryExtractionService` 先跑 Gatekeeper（判断哪些层该抽），再并行跑 5 个层抽取器（`packages/memory-user-memory/src/services/extractExecutor.ts:35-41,215-266,268-290`）。触发面包括 `workflows/memory-user-memory/workflows/hourly.ts`（小时级批处理，按用户分页）和 webhook（`apps/server/src/router-hono/webhooks/handlers/memoryExtraction.ts`）。
- 另有 **用户 persona 文档**：`user_memory_persona_documents` + 历史快照表（`snapshotPersona/diffPersona/reasoning/previousVersion/nextVersion/editedBy`），由专用 persona writer agent 定期重写，并用 Markdown「像传记作者一样」描述用户（`schemas/userMemories/persona.ts:13-79`；`packages/memory-user-memory/src/prompts/persona.ts:2-60`）。
- 注入：`UserMemoryInjector` 把 persona + 各层记忆拼成一段文本，放在**第一条 user 消息之前**（`packages/context-engine/src/providers/UserMemoryInjector.ts:31-65`；服务端装配 `apps/server/src/modules/Mecha/ContextEngineering/index.ts:113-114`）。
- 工具面：内置工具 `lobe-user-memory`，API 为 `searchUserMemory` + `add{Activity,Context,Experience,Identity,Preference}Memory` + `update/removeIdentityMemory` + `queryTaxonomyOptions`（`packages/builtin-tool-memory/src/manifest.ts:17`；`src/types.ts:8-18`）。
- **每 agent 只是开关**：`chatConfig.memory{enabled,effort,toolPermission}`（`types/agent/chatConfig.ts:13-19`）。

### 4.2 Agent documents（per-agent 文件，最接近我们的记忆文件）

`agent_documents` 是 per-agent（`agent_id` 非空外键）+ 指向通用 `documents` 行的绑定表，带访问位掩码（`accessSelf/accessShared/accessPublic` 5-bit）与加载策略（`policyLoad`、`policyLoadPosition`、`policyLoadFormat`、`policyLoadRule`）（`packages/database/src/schemas/agentDocuments.ts:52-183`）。

注入位置有 8 种：`before-system / system-replace / system-append / before-first-user / after-first-user / context-end / manual / on-demand`（`packages/context-engine/src/providers/AgentDocumentInjector/shared.ts:12-21`）。注入分两桶：`policyLoad='always'` 全文内联；`progressive` 只给一张 **索引表**（TITLE/ID/SIZE/UPDATED + 文件夹折叠），模型按需 `readDocument(id)`（`shared.ts:327-380`）——这与我们 ADR-0004「目录树注入、正文按需」思路一致。注意它**仍不是「记忆」**：定位是 agent 的知识/提示文档，且不参与分享或复制（见 §6）。

### 4.3 知识库（文件 / RAG）

- KB 是用户/workspace 资产：`knowledge_bases`（`visibility` 独立于市场 `isPublic`）+ `knowledge_base_files` join（`packages/database/src/schemas/file.ts:302-350,362-387`）；chunk 与 embedding 在 `chunks/unstructured_chunks/embeddings`（`schemas/rag.ts:17-80`）。
- 与 agent 的绑定走 `agents_knowledge_bases` / `agents_files`（§2.1），运行前由 `KnowledgeInjector` 注入 file contents + KB 信息（`packages/context-engine/src/providers/KnowledgeInjector.ts:30-73`）。

### 4.4 结论：lobehub 没有「打包记忆」这回事

- 记忆 persona 是 **user 级**；agent 只有开关，没有自己的长期记忆仓库（`userMemories` 表无 `agent_id`）。
- **duplicate agent 不复制任何记忆/知识**：`AgentModel.duplicate()` 的 insert 列表只有 config 字段（`packages/database/src/models/agent.ts:1658-1703`），没有 documents、`agents_knowledge_bases`、`agents_files`、connectors。
- **市场安装同样只拷贝 config**：`installMarketplaceAgents()` 展开 `detail.config` 再显式补 title/avatar 等，无 KB/文件/记忆导入（`src/services/installMarketplaceAgents.ts:144-167`）。
- **分享**只提供「访客读创建者记忆」的开关，而不是把记忆装进分享物：`agent_shares.share_config.allowReadMemory`（默认 `false`，`schemas/agentShare.ts:14-18`）；运行时该开关关掉即 `globalMemoryEnabled=false`（`apps/server/src/services/aiAgent/index.ts:1125-1131`），shareGate 还**无条件剥离** files/KB（`apps/server/src/services/aiAgent/shareGate.ts:120-126`），并对 memory 只放行读、写 API 全禁（`shareGate.ts:272-277`）。
- **账号级数据导出**也刻意不含记忆：导出表清单里 `agentsKnowledgeBases`/`files` 被注释掉，`userMemories`/persona 从未出现（`packages/database/src/repositories/dataExporter/index.ts:54-93`）。

## 5. Skills

- 与 Claude Agent Skills 同构：`agent_skills` 表存 `name/description/identifier/source(builtin|market|user)/manifest/content/resources/zipFileHash`（`packages/database/src/schemas/agentSkill.ts:11-65`）；manifest 就是 SKILL.md front matter（name/description/version/license/permissions/repository…，`packages/types/src/skill/index.ts:10-38`）。
- 来源：内置、市场（`@lobehub/market-sdk`，`packages/types/src/discover/skills.ts:65-105`）、用户导入（GitHub / URL / ZIP / Market，`src/services/skill/index.ts:29-42`），资源以 CAS zip 存 `global_files`（`schemas/agentSkill.ts:39-42`）。
- **挂载方式不是外键，而是「池 + 激活」**：SkillEngine 汇总全部可用 skill，再与该 agent 的 enabled plugin ids 配对（`packages/context-engine/src/engine/skills/SkillEngine.ts:33-57`）；`SkillContextProvider` 把未激活技能渲染成 `<available_skills>` 列表，已激活的全文注入 system prompt（`packages/context-engine/src/providers/SkillContextProvider.ts:61,82-129`）；模型用 `activateSkill` / `readReference` 按需加载（`packages/builtin-tool-skills/src/manifest.base.ts:5-41`）。
- 控制粒度：agent 侧 `chatConfig.skillActivateMode='auto'|'manual'`（默认工具自动激活 vs 只认用户选择，`types/agent/chatConfig.ts:162-168`）。
- 与我们对照：DSH skills 也是 SKILL.md + 按需加载；lobehub 多出来的是「市场安装 + zip 资源 + 用户编辑」这一管理面。

## 6. 分享、市场与多智能体

### 6.1 市场（Assistant Market）与 fork/install

- Agent 行有 `marketIdentifier`（发布标识，`schemas/agent.ts:55`）；市场侧 fork 有独立类型 `AgentForkRequest/Response`（含 `forkedFromAgentId`/version，`packages/types/src/discover/fork.ts:8-77`）；列表项暴露 `knowledgeCount`/`pluginCount`/`forkCount` 等统计（`packages/types/src/discover/assistants.ts:43-71`）。
- 安装 = 市场 fork + 本地 `createAgent({ ...detail.config })`，只导入 config（§4.4）。**KB/文件/记忆/历史都不随之而来**。

### 6.2 duplicate（同账号复制）

- `duplicateAgent` 走 `AgentModel.duplicate()`：复制 agencyConfig、chatConfig、model、params、plugins、systemRole、opening 等 **config 字段**，并 sanitize 设备绑定；**不复制 topics/threads/messages**（`packages/database/src/models/agent.ts:1634-1703`）。
- 另有一条「带历史复制」通道（`AgentCopyJobModel`）：复制 topics/threads/messages，但只用于 **agent group 的复制/迁移**，仍不涉及记忆与知识（`packages/database/src/models/agentCopyJob.ts:39-65,374-455`；`packages/database/src/repositories/agentGroup/index.ts:201-267`）。

### 6.3 分享链接（share）

- `agent_shares` 一行：`visibility: private|link` + `shareConfig`（`allowCreatorViewSessions`、`allowReadMemory`、`maxFileStorage`、`maxTopicsPerVisitor`、`maxTurnsPerTopic`、`monthlySpendLimit`、`toolGrants`、`slug`）（`schemas/agentShare.ts:7-68,88-116`）。
- 访客面是「受门控的同一 agent」：builtin 工具默认全禁（default-deny allowlist），MCP/市场插件按 `toolGrants` 放行，files/KB 一律剥离（`apps/server/src/services/aiAgent/shareGate.ts:120-126,150,303-320`）。
- 访客会话用 `topics.senderId` 标记，导出时会被过滤，不混入创建者数据（`schemas/topic.ts:86-90`；`dataExporter/index.ts:14-32`）。

### 6.4 workspace 内转移（transfer）

成员间移交 agent 有一份显式 **manifest**：列出会随行/失效/被剥离的东西——bot bindings（转过去变 disabled）、connectors（断开或 unmount）、cron jobs、device binding、knowledge mounts（收件人无权限则 detach）、groups/tasks/projects 引用（`packages/database/src/repositories/resourceTransferManifest/index.ts:32-57`）。这就是 lobehub 对「一个 agent 到底带了什么」的答案——**配置与挂在 agent 上的集成会走，记忆与知识不会**。

### 6.5 多智能体

- `chat_groups`（`config{systemPrompt,allowDM,revealDM,opening…}`）+ `chat_groups_agents`（`enabled/order/role∈supervisor|participant`）（`packages/database/src/schemas/chatGroup.ts:20-133`；`packages/types/src/agentGroup/index.ts:13-33,126-131`）。
- 运行时有 `GroupOrchestrationRuntime/Supervisor`（`packages/agent-runtime/src/groupOrchestration/`）。Group 也可 fork/上架，fork 响应包含成员 agent 的批量复制（`discover/fork.ts:130-167`）。
- 对 BotHarness：这对应我们未来的 roster/委派 +（跨 PersonaBot）协作；我们目前只有单 bot 会话与 seam（`docs/botharness.md:72-76`）。

## 7. 工程实践（择要）

- Monorepo：`packages/{database,types,context-engine,agent-runtime,prompts,memory-user-memory,builtin-*}` + `apps/{server,desktop,cli}` + `src/{spa,routes,features,store,services}`（`AGENTS.md:17-27`）。
- Schema 全在 `packages/database/src/schemas/*`（Drizzle，单文件一域）；JSONB 存 config，强约束字段才建列。
- 质量为 `bun run check [files]`（lint+test+type），每修 bug 要求回归测试（`AGENTS.md:45-50`）。
- 自省/自我迭代：内置 `agent-management` 工具让模型 CRUD agent（create/update/delete/duplicate/installPlugin/updatePrompt/searchAgent/callAgent）（`packages/builtin-tool-agent-management/src/manifest.ts:12-325`），并有 skill-management、self-iteration 等内置 agent（`packages/builtin-agents/src/agents/`）。

## 8. 可借鉴清单

| 建议     | 主题                             | LobeHub 机制（来源）                                                                                     | 对 BotHarness 的含义                                                                                           |
| -------- | -------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **采纳** | 插件三态（pinned/auto/disabled） | `AgentPluginEntry` + `getActivePluginIds`（`types/agent/pluginConfig.ts:12-98`）                         | PersonaBot 的工具/skill 绑定可加「显式启用/默认/禁用」，比数组包含更可表达；兼容旧值（字符串= pinned）         |
| **采纳** | Agent 文档的「索引表 + 按需读」  | `<agent_documents_index>` progressive 索引（`AgentDocumentInjector/shared.ts:327-380`）                  | 与我们 ADR-0004 同路；可借其 **固定宽度 TITLE/ID/SIZE/UPDATED 格式**与按 `updatedAt` 排序（对提示缓存友好）    |
| **采纳** | 注入位置枚举                     | before-system / system-replace / system-append / before-first-user …（`shared.ts:12-21`）                | PersonaBot 的 persona/记忆注入可按语义定位，而不是「全塞 system」                                              |
| **采纳** | 每 agent 的 IM/平台绑定表        | `agent_bot_providers`（platform/applicationId/加密凭据/settings）（`schemas/agentBotProvider.ts:18-63`） | DeepSeekBot M5 的「一个 PersonaBot 接一个飞书应用」正好是这个形状；凭据进 DSH credentials（M8）                |
| **采纳** | 模型选择策略 fixed/member        | `modelSelectionPolicy` + 优先级解析（`modelSelection.ts:65-83`）                                         | 若 PersonaBot 被多人共享，需要「共享默认模型 vs 每人自选」的策略位                                             |
| **参考** | 分享/移交 manifest               | `MemberTransferManifest`（`resourceTransferManifest/index.ts:32-57`）                                    | SoulSnapshot 的「清单」思路同源：先告诉用户包里有什么；可借字段（知识 detach、集成失效）做我们的 snapshot 清单 |
| **参考** | 记忆抽取的分层 Gatekeeper        | 5 层 + gatekeeper（`extractExecutor.ts:35-41,268-290`）                                                  | 若 M6 以后做记忆蒸馏，gatekeeper「先判断再抽取」比逐条抽取省 token；但我们 ADR-0003 仍坚持显式写               |
| **拒绝** | user-level 记忆 + agent 只留开关 | `user_memories` 无 `agent_id`（`schemas/userMemories/index.ts:7-48`）                                    | 与 PersonaBot「身份自带记忆」直接冲突；我们坚持 per-PersonaBot 文件记忆（ADR-0002/0013）                       |
| **拒绝** | 全栈自建（账号/DB/市场/客户端）  | `AGENTS.md:5-7`                                                                                          | 违背 ADR-0015（插件层、DSH 内运行）                                                                            |
| **拒绝** | 分享靠「读创建者记忆」开关       | `allowReadMemory`（`schemas/agentShare.ts:14-18`）                                                       | 我们分享的是快照副本，不是访问权；不引入「访客读我的记忆」这种隐私面                                           |

## 9. 存疑与待验证

1. **市场侧配置细节**：`getAssistantDetail`/`forkAgent` 的云端返回 schema 不在本仓库（`@lobehub/market-sdk` 为外部依赖），`detail.config` 是否含 KB 引用的字段未验证；本地安装路径确认只写 config（§4.4）。
2. **记忆自动抽取的触发/配额**：只确认了 gatekeeper + 层抽取器 + Upstash workflow（hourly/webhook），未逐行验证「每个用户每小时抽多少话题」「失败重试」等配额细节。
3. **agent documents 与 skill bundle 的转换**（`convertAgentDocumentToSkillIndex`，`agentDocuments/agentDocument.ts:465-560`）只读了部分实现，UI 工作流未验证。
4. **`societies`（agent 组织）**：`agents.societyId` 已见列（`schemas/agent.ts:67-72`），但 societies 表本身不在 OSS（注释称「until the societies table exists」），**未验证**。
5. **分享链接的计费/限额执行**在 Cloud（business slot），OSS 只有配置字段（`schemas/agentShare.ts:39-42`）。
6. TTS/STT、图像生成、评测（agent-eval）、acceptance/verify 体系未深入，本报告不评价。

## 10. 对我们的启示

### 10.1 值得借的（skill/MCP/模型绑定 UX）

1. **三态绑定**（pinned/auto/disabled）比「数组里有没有」好：模型能理解「用户装过但我不该用」，UI 也能区分「默认可用」与「显式启用」。建议 `bot.json` 的 tools/skills 字段引入等价语义（对齐 ADR-0024/0025 的 Orchestrator/Channel 方向时一并定）。
2. **Agent 文档索引表**：固定宽度 TITLE/ID/SIZE/UPDATED + 按 updatedAt 排序 + 文件夹折叠（`shared.ts:159-205,278-303`），是我们「目录树注入」的一个更省 token 的排版参照；其中「绝对日期而非相对时间，避免提示缓存失效」的注释（`shared.ts:143-157`）直接适用于我们的 memory tree 注入。
3. **每 PersonaBot 一个 IM 应用绑定表**：`agent_bot_providers(platform, applicationId, credentials加密, settings)` 就是 DeepSeekBot 侧「一个 bot 一个飞书应用」的最小形状；凭据仍走 DSH credentials（M8），表只留引用。
4. **插件 manifest 自带的 `systemRole`**（`types/tool/manifest.ts:30`）：工具不只是函数，还能带使用说明——如果我们允许 PersonaBot 安装 DSH 工具包，manifest 可携带提示词片段。
5. **错误默认值**：shareGate 对 builtin 工具 **default-deny**、对 MCP/市场插件按白名单（`shareGate.ts:150,303-320`）——任何「新工具默认是否暴露」的问题都应默认拒绝。

### 10.2 与我们的模型不同的

1. **记忆归属**：lobehub 记忆是 user 级（跨 agent 共享），agent 只是开关；我们是 per-PersonaBot 文件记忆（ADR-0002/0013）。他们的设计让「换 agent 也不丢用户偏好」，但做不到「这个 bot 自己记得什么」——我们的身份叙事更强。
2. **知识不随 agent 走**：KB/files 是用户资产，duplicate/fork/share 都不带（`agents_knowledge_bases` 不复制；share 强制剥离）。我们若走 SoulSnapshot，需要显式决定「知识是否进包、进包后是复制还是引用」。
3. **人格分两处**：`systemRole`（行为提示词）+ `profile`（角色卡，明确不影响行为）。我们 `PERSONA.md` 一文件承载身份；未来可考虑在 SoulSnapshot 里区分「人格/行为指令」与「展示性角色卡」，但不必引入两条存储。
4. **分享=访问权，不是副本**：lobehub share 是「指向我的 agent 的受限运行」，访客会话算在创建者账号下，靠 `senderId` 隔离；我们是「导出快照副本」。两条路都不错，但我们的快照模式天然可离线、可迁移，更适合「身份可携带」的主张。

### 10.3 明确结论：lobehub 不打包记忆 —— SoulSnapshot 记忆打包是我们的差异点

按本仓库证据：

- duplicate/fork/install/账号导出 **都不包含记忆**（§4.4；`models/agent.ts:1658-1703`、`installMarketplaceAgents.ts:144-167`、`dataExporter/index.ts:54-93`）；
- 分享只允许访客**读**创建者的 user 级记忆，且默认关（`agentShare.ts:14-18`；`aiAgent/index.ts:1128-1131`）；
- 知识库/文件在分享中被无条件剥离（`shareGate.ts:120-126`），在 duplicate 中不复制。

也就是说，lobehub 能分享的只有「配置 + （付费场景下的）系统提示词」，**agent 的持久记忆与知识从不随包走**。这正好反向验证了我们 ADR-0020 的 SoulSnapshot：把 persona + 文件记忆（+ 可选知识）打成可版本化、可迁移的包，是当前这些平台都没有提供的能力，应作为 BotHarness 对外的第一差异点来叙述与验证（M6 / #17）。
