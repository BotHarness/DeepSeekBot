# 从 IM 请求私密输入，在 Web Chat 完成

opt-in 受保护 Profile 支持真实 PersonaBot 从已授权 IM 请求发起私密输入：Owner 在既有 Web 私聊多字段卡片提交，固定消费者在现有执行审批后使用引用，Bot 将非私密结果回帖到原 IM 会话。首次真实 Provider 验证使用独立 Lark QA2 私聊；不新增原生 IM 私密表单，也不代表任意 CLI/MCP 都能安全消费秘密。

按[CLI 验证指南](private-input-cli.md)准备隔离 Linux 执行边界，按[测试 App 指南](../../agents/im-test-apps.md)配置独立 App 并通过现有 Provider 绑定真实 Bot。不要为其他 Host 正在使用的 App 启动第二个接收器，QA1 与生产 Profile 保持独立。

在隔离 Profile 的 `botharness-core` patch 中设置 `privateInputExecution: true`、`telemetry: false` 和 `privateInputWebUrl: http://127.0.0.1:31393`。Web origin 必须是 Owner 实际可达的地址，不带登录 token、userinfo、query 或路径。构建后只重启任务自己的 Host。运行 `node scripts/ask-secret-lifecycle-fixture.mjs 31394`。

## 通过 Tailscale 访问服务器

每次请求动态生成卡片 fragment；基础 origin 由 Profile 显式配置，不从 IM 发件人、浏览器请求或本地监听端口推断。服务器部署时，将 `privateInputWebUrl` 设为 Owner 现有可达的 HTTPS 地址，例如 `https://<machine>.<tailnet>.ts.net`；实际机器名与 tailnet 域名只写本机配置。DSH 可继续监听 loopback，由现有反向代理转发。[Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) 将本地服务开放给 tailnet，并沿用访问控制规则；Owner 设备须具有相应 tailnet 访问权。

按 DSH 既有配置信任这个确切代理 hostname，核对认证 `/api` 与实际 Owner 通过该 origin 打开并提交卡片。网络可达和卡片链接不替代 Host Owner 登录。机器名、tailnet 域名或代理端口变化后，先更新 Profile 基础地址；已发出的旧链接仍指向旧地址。本地验收不会修改 Tailscale、代理或生产服务器配置；最终 Linux／代理复验由 #1386 跟踪。

## 本地受控测试

在指定测试私聊发送：

```text
【IM-PRIVATE-A】用 ask_secret 请求账号 im-demo 的三个必填字段：
endpoint（私密 URL）、api_key（API key）、api_secret（API secret）。
等待 Owner 在 Web Chat 私密卡填写；随后用 protected_cli 的
http-status-v1 消费返回的引用。通过 bridge_reply 在原会话只报告
HTTP 状态和成功与否。不要在 IM 收集或发送私密值、引用或配置详情。
```

Host 应在原会话发送 Web 卡片定位链接，只含既有 Chat 与卡片 ID，不含秘密、凭据引用或登录 token。在已认证 Owner 的 Web Client 新标签中打开，Bot 模式应定位到实际请求卡。当前只在 Client 初次加载时读取定位 fragment；仅修改已加载页面的 fragment 不会自动重新导航。

只在私密组件填入：

| 字段       | 合成值                                                      |
| ---------- | ----------------------------------------------------------- |
| 私密 URL   | `http://127.0.0.1:31394/status?marker=SYNTHETIC-1380-url-A` |
| API key    | `SYNTHETIC-1380-key-A`                                      |
| API secret | `SYNTHETIC-1380-secret-A`                                   |

提交后输入清空，普通 Chat 只记录已配置状态。现有审批应仅显示账号、`http-status-v1` 与字段引用。选择允许一次，确认原 IM 回帖 HTTP 200／成功，并通过受控服务 `GET /evidence` 独立核对真实认证完成。Owner CLI 也可通过 `ask-secret-submit --values-stdin` 提交同一多字段 JSON；持有链接或位于 IM 群聊不会获得配置权。

再次使用同一账号可复用当前引用。一个轮次接收多个 IM Source Event 时，`ask_secret.source_event_id` 必须明确选择本轮实际来源；旧历史或未知来源不能提供授权。同一轮次的不同来源选择同一账号时，消费明确拒绝歧义。普通文本、附件、引用消息与群卡都不是秘密提交入口。

回归检查：等待输入时变更／撤销接收 Binding、停止 Bot 或改变 Session 归属，旧卡必须过期，已认证的迟到提交也失败。消费者运行中撤销账号或来源授权，Host 尝试停止并拒绝迟到结果回帖；Provider 已开始的副作用仍可能不确定。通知投递失败会过期当前请求，不自动重试。后续独立轮次与 Schedule 的已配置引用复用仍按各自当前授权验证。

原生 Session 经[白名单导出器](../../../scripts/export-private-input-evidence.mjs)保留字段声明、引用配置、审批决定与有界 HTTP 结果；完整 Session 和原始请求体留在本机。`ask-secret-wire-probe.mjs` 记录真实模型请求的可捕获状态、次数、字节数与合成 canary 命中数。另检查留存 Session、Chat／审批、日志与 Spill；零命中仅证明指定 canary 与实际检查范围。可见 IM 回帖应关联同一 canonical Source Event、handled Admission 及通知／最终回复各自 Outbox receipt。边界见 [ADR-0172](../../adr/0172-im-private-input-keeps-owner-web-authority-and-source-reply-fences.md)；Discord、Lark 群聊与 #1386 Linux 服务器验收不能从本次私聊成功推断。
