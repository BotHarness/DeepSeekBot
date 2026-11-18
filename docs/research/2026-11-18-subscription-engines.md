# 订阅引擎调研：OpenMausBot 与 t3code（2026-11-18）

| 项   | 内容                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| 问题 | 用户反馈 OpenMausBot 能用已有的 Claude / ChatGPT 订阅额度跑 Bot。它是怎么做的？是 ACP 吗？我们能不能让整个 Bot 跑在订阅上？ |
| 版本 | OpenMausBot `31109fa`（2026-11-18）、t3code `03822a83`（2026-11-18）、Cloudflare Forge `main`                               |
| 结论 | 见 [ADR-0353](../adr/0353-persona-bot-sessions-can-run-on-a-subscription-engine.md)                                         |
| 方法 | `git clone --depth 1` 只读阅读，未安装、未运行                                                                              |

## 1. 结论

不只是 ACP。两个项目都在用户本机把**官方 agent CLI 当子进程**跑，用的是用户已经在 CLI 里登录好的订阅；每家用各自原生的协议：

| 引擎         | OpenMausBot                                                        | t3code                                                               |
| ------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Claude Code  | `claude -p --input-format stream-json --output-format stream-json` | `@anthropic-ai/claude-agent-sdk` 的 `query()`，指向用户装的 `claude` |
| Codex        | `codex app-server` JSON-RPC                                        | `codex app-server`                                                   |
| ChatGPT 订阅 | 自己完成 Sign in with ChatGPT，把 token 交给 Codex                 | 同样，经 `CodexManagedTokenBroker` 通过本机 socket 交给 Codex        |
| 其余         | ACP（Copilot、Cursor、Grok Build、Kimi、Qwen、OpenCode、DSH 等）   | ACP（`packages/provider-acp`）                                       |

两者的外层都是普通代码（Node harness / server），没有另一个模型在当 orchestrator。OpenMausBot 的起标题、整理记忆等后台活也调当前引擎（Claude 引擎起一次性 `claude -p` 跑 Haiku，`server/drivers/claude-background.ts`）。

## 2. OpenMausBot

- **Claude**：每个 thread 保留一个 stream-json 进程，prompt 从 stdin 写入（`server/drivers/claude.ts:1-2, 1010-1016`）。删掉继承的 `ANTHROPIC_API_KEY`，否则会从订阅变成按 token 计费（`claude.ts:133-134`、`claude-billing.ts:3-9`）。多账号靠 `CLAUDE_CONFIG_DIR`。
- **Codex**：app-server（`codex.ts:10-11, 549`）。ChatGPT plan 用 OAuth scope `chatgpt.tokens.use.direct`（`chatgpt-plan-auth.ts:11-13`），通过 `-c model_providers…auth.command` 交给 Codex（`codex-plan-token.ts:15-35`），只在本地启用，托管版明确禁用（`docs/verification/chatgpt-plan.md`）。
- **ACP**：通用客户端 `server/drivers/acp/core.ts`；Copilot `copilot --acp --stdio`、Cursor `cursor-agent acp`、DSH `dsh --profile acp`（`acp/deepseek.ts:1-2`）等。
- **Bot 能力**：harness 给子进程挂一个 agents MCP server（Claude 用 `--mcp-config`，`claude.ts:1141`）。身份在环境变量里：`OMB_BOT_ID`、`OMB_THREAD_ID`、`OMB_COMMS_TOKEN`（`agents-proxy.ts:1-9`），每次调用回到 `127.0.0.1` 上的 harness（`agents-call.ts:52-60`）。工具有 `post_to_room`、`start_thread`、`memory_update`、`create_options_card` 等。
- **回复**：harness 读输出流，把最终文本存成 Bot 消息（`server/harness/public-reply.ts`）。
- **审批**：`--permission-prompt-tool mcp__ogb__approve`（`claude.ts:1129`），经 unix socket 交给 broker（`permission-proxy.ts`）。
- **隔离**：`--strict-mcp-config`、`--setting-sources project`（`claude.ts:1040-1041`），人格用 `--append-system-prompt-file`（`claude.ts:1248`）。
- **额度显示**：从 Keychain / `.credentials.json` 读 OAuth token 调 `api.anthropic.com/api/oauth/usage`（`server/plan-usage.ts:125, 981`）。只用于显示，不用于推理，但处在 Anthropic「不得收集凭据」的灰色地带。

## 3. t3code

- **Claude**：Agent SDK，`pathToClaudeCodeExecutable` 指向用户的 `claude`（`apps/server/src/orchestration-v2/Adapters/ClaudeAdapterV2.ts:1213`）；审批用 `canUseTool`，MCP 用 `setMcpServers` 动态挂载。额度用 SDK 的 usage 请求（`provider/claudeUsageLimits.ts`），不读 token。
- **MCP 网关**：Host 上一个 HTTP MCP server（`mcp/McpHttpServer.ts`）；`McpSessionRegistry.issue()` 为每个引擎会话签发 bearer token，绑定 thread、provider session 和能力范围，会话结束即作废（`mcp/McpSessionRegistry.ts`）。ACP 规定必须支持 stdio，所以有 stdio 转 HTTP 的桥（`mcp/AcpMcpStdioBridge.ts`）。默认只列 `orchestrator_capabilities`、`delegate_task`、`task_status`、`tool_search`，其余按需搜索（`mcp/McpToolExposure.ts`）。
- **跨引擎委派**：`delegate_task` 可以让子任务跑在另一家引擎上（`mcp/OrchestratorMcpService.ts`、`delegatedTaskModes.ts`）。
- **界面**：各引擎 adapter 先归一化成同一种 turn item，再交给界面。

## 4. Cloudflare Forge

[Forge](https://github.com/cloudflare/forge) 从一份 OpenAPI 同时生成 SDK、CLI 和 MCP 工具，每个 API 方法一个 tool（[rfcs/mcp.md](https://github.com/cloudflare/forge/blob/main/rfcs/mcp.md)）。它只生成工具，不生成 server，鉴权由外面的 server 注入。对我们的启发：CLI 与 MCP 共用一份 schema，身份由网关绑定。我们的 `ToolDefinition` 已经是 CLI（`bot-tool`）和 direct catalog 共用的唯一 schema。

## 5. 条款

| 引擎         | 依据                                                                                                                                                                                                                           | 风险                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Claude 订阅  | [Anthropic legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)：允许用户用自己的订阅登录未修改的 Claude Code；禁止第三方接入 claude.ai 登录、收集或转用凭据；另有「用 Agent SDK 做产品应使用 API key」 | 中：额度按普通个人使用设计，多个 Bot 全天候运行可能被限流 |
| ChatGPT 订阅 | [Sign in with ChatGPT 本地开源流程](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)                                                                                                                      | 本地低；托管需 OpenAI 审批                                |
| ACP 各家     | 未逐条核实                                                                                                                                                                                                                     | 未知                                                      |
| Gemini CLI   | OpenMausBot 注释称消费级 CLI 自 2026-06 起不可用（`acp/gemini.ts:1-3`）                                                                                                                                                        | 不适用                                                    |

## 6. 我们的现状

- Bot 工具是 `#orchestratorTools` 里内联的 `defineTool`（`packages/core/src/runtime/dsh-bot-agent-adapter.ts`），schema 就是 DSH 的 `parameters`；`directTools()` 已能映射为 `inputSchema`。
- 回复必须调 `bot_send_message`（`runtime/bot-message-tool.ts`），Assignment 用 `report_to_orchestrator`。
- 审批由 `ChannelToolApproval`（`workspaces/tool-approval.ts`）挂在 DSH `approval/request` 上，只接受已跟踪的 tool call；`tob/cli-approval.ts` 是非模型调用的先例。
- 没有 ACP、没有对外的 Bot MCP server。
- Session detail 面板读归一化的 `SessionTranscriptItem` 与 live 快照（`runtime/session-transcript.ts`、`session-live.ts`）。
- 我们通过 `DshAgentHost.create/resume` 拿到 DSH `AgentHandle`，暂未找到替换 Session 执行者的 DSH 接口。
