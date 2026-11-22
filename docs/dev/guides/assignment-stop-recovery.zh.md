# 停止 Assignment 并检查恢复

本指南说明已在 DSH 0.2.0-rc.1 核验的 BotHarness 流程。Assignment 是运行于显式归属 DSH Session 的 application-defined 工作；其权威边界见 [ADR-0045](../../decisions/sessions.md#adr-0045) 与[架构](../../architecture/botharness-architecture.md)。

## Human 操作

1. 为 PersonaBot 授权一个 Workspace，请 Orchestrator 用该 Grant 和可选 Continuity Key 创建一个 Assignment。默认 permission snapshot 为 `workspace-write`。
2. 如果 Assignment 等待工具审批，保持审批待处理。请 Orchestrator 检查 Assignment，再以其 Session ID 调用 `stop_assignment`。
3. 等待工具确认 `stopped`。向 Assignment 发送“结束工作”的后续指令不能替代停止操作。待处理审批会失效，后续请求／报告被拒绝，Continuity Key 被释放。
4. 刷新 Client。没有其他所属 Session 工作时，Bot 回到空闲。在活动中心 → 总览选择“显示空闲 Bot”，即可继续看到该 Bot；已停止 Assignment 不会作为活动 Session 卡片展示。
5. 重启 Host 后，Directory 保留已停止 Session 及其原 permission snapshot，Channel 历史仍有停止确认。同一 Grant 和已释放的 Continuity Key 可创建不同的 Assignment Session。

停止不会删除 Session、历史、Grant 或权限事实。DSH 拒绝停止时，Assignment 保持 `stopping` 并保留名额，直到显式重试停止成功；此时不能提前宣称成功或创建替代工作。Host Lifecycle Notice 与 Assignment 自行提交的 Report 仍是不同事实。

## 已核验边界

| 边界             | 证据                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 可信创建         | 真实 Orchestrator `create_assignment`、所属 Workspace Grant、`workspace-write` snapshot 与 Continuity Key                  |
| 待处理审批       | 真实原生 Shell 调用等待 Human 授权；Windows 上为 `pwsh`，适用 Host 上为 `bash`                                             |
| 停止             | BotHarness `stop_assignment`（结果来自原生 Session 记录） 结果成功；待审批 Shell 没有成功结果；审批变为 expired            |
| Directory 与活动 | stopped Session 保留权限事实、释放 key、未观察到停止后的 Report，Bot 回到 idle                                             |
| 重启             | 原 stopped 状态、权限 snapshot 与历史保留；新 Assignment 使用同一 Grant/key；成功 Report 结果早于所有匹配的原 Channel 回复 |

[真实截图与公开证明](https://github.com/BotHarness/BotHarness/blob/main/docs/assets/pr/81-assignment-stop-recovery/README.md)记录了本次执行。此次验收只覆盖 [#81](https://github.com/BotHarness/BotHarness/issues/81) 的窄切片，不关闭整个 foundation，也不声称已验证全部崩溃／权限／并发场景。

## Agent 复现

用 `scripts/dev-instance.mjs` 启动隔离 Profile。将 `BH_E2E_ORIGIN` 设为其 loopback URL，`BH_E2E_HOME` 设为该 home，`BH_E2E_EVIDENCE` 设为私有证据目录。启动器提供认证 cookie 文件；凭据留在本机。

```bash
node scripts/e2e-assignment-stop-recovery.mjs prepare
node scripts/e2e-assignment-stop-recovery.mjs stop
```

停止该启动器对应的精确 Host PID，再用相同 worktree 和 DSH 版本重启同一隔离 home，然后执行：

```bash
node scripts/e2e-assignment-stop-recovery.mjs restart
```

`pending` 核验已经准备好的待审批场景，不再创建 Bot。`capture` 不发模型请求，只重新截图最后一个阶段。公开记录仅含有界 QA 标识、安全工具名和结果标记；不发布原始 Session snapshot、工具参数／结果、机器路径、凭据或登录 URL。脚本使用既有认证 API Gateway、原生 Session Query 和真实 UI，不安装测试 Plugin 或替代生命周期。
