# 隔离 Linux Host 的私密输入复验

本指南复验 [ADR-0164](../../adr/0164-private-input-candidate-separates-native-storage-from-qualified-execution.md) 的 opt-in 执行边界，不授予部署权限。使用现有 IM App 前，先取得明确的服务器变更范围与独占接收器窗口。使用合成凭据和 loopback 受控服务；同一 App 不得同时启动第二个接收器。

## 安装与授权边界

锁定仓库版本、Node、pnpm、DSH `0.2.0-rc.1`、已核验的 IM Provider 和 [CLI 指南](private-input-cli.md) 中的 Docker 镜像。使用独立 checkout 和私有 DSH home；启动前记录准确的进程身份与既有代理路由。先停止经核对的本任务原接收器，再启动 Linux 接收器。

跨平台迁移 Profile 时，先停止原写入者，保留 native credential store 和真实 Bot 身份。单独审计路径元数据，不修改不可变 Session Events。`session_ownership.cwd_reference`、Memory ownership/checkpoints、native Session header/project directory，以及 IM Provider 的 `integrations/dsh-feishu/workspaces.json` 中的 Windows 路径，需要明确且有界的转换。只接受已审计的原 home 前缀和新私有 home 内的目标；核对保留的压缩 Session Event frames 字节完全相同。不得重写历史消息、凭据、引用或任意 JSON 字符串。

在既有 core Patch 配置 `privateInputExecution: true`。把 `privateInputWebUrl` 设为 Owner 可访问的 HTTPS origin，并配置 native Connection 的精确 trusted authority。可以使用 Tailscale Serve 转发 loopback DSH Host，同时保留其他路由和 native Owner 认证。IM locator 只包含 Channel/card ID，不包含登录令牌，也不授予提交权限。参见 [IM 指南](private-input-im.zh.md)。

## Linux 工作区权限

普通 CLI 和 stdio MCP 容器使用 `65534:65534`。可写 Workspace Grant 与 Linux 文件权限是两项独立要求。通过 ownership、专用 group 或 ACL，仅为已授权根目录准备访问权限；覆盖目录遍历、既有文件及后续新文件。凭据 home 和无关工作区保持私有。不得通过切换容器为 root 或挂载整个 Host home 来修复权限错误。

本次隔离复验使用 Host 拥有的 Bot Memory，guest group 为 `65534`，setgid 目录为 `2770`，非秘密文件为 `0660`。上层凭据 home 目录保持 `0700`，native credential 文件保持 `0600`，Host 管理的 Git 元数据不开放 guest 写入。这是明确的测试环境准备，不是自动修改用户工作区权限的产品策略。必须从 Host 和 guest 两侧核对实际持久文件；目录权限不能证明后续文件访问。

Docker 测试显式设置非秘密临时 fixture 的权限，也覆盖 Host 使用私有 `077` umask 的情况：

```bash
BOTHARNESS_PRIVATE_DOCKER_QA=1 pnpm exec vitest run \
  packages/core/test/protected-execution.test.ts \
  packages/core/test/linux-execution.test.ts \
  packages/core/test/linux-mcp.test.ts --maxWorkers=1
```

## 核对真实安装行为

| 路径                        | 必须观察的结果                                                                                                                                     |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真实 IM → Owner Web → 原 IM | 既有 PersonaBot 请求三个动态字段；真实 Web 提交清空输入；既有审批只携带引用；固定 CLI/MCP 认证；canonical Source/Admission/Outbox 与可见回帖一致。 |
| 普通 CLI/MCP                | 不产生新秘密输入；工作区文件持久化、guest UID、独立 stderr 和退出码；真实大输出 Spill；普通 MCP 读取同一文件且没有 Host 凭据环境。                 |
| 身份与读取隔离              | 另一真实 Bot 即使取得执行审批，也在访问受控服务前被拒绝；Host 凭据路径、ambient environment、Docker socket 和 Git 写入探针失败。                   |
| 生命周期                    | 取消及并发／过期提交只有一个 canonical 结果；轮换使旧引用失效；撤销拒绝新使用并尝试停止已启动的消费者。                                            |
| 重启与 Schedule             | 旧 pending 卡过期；一次性 Bot Schedule 在准确重启 Host 后自然到期，复用已配置引用而不生成新卡；旧／撤销／缺失账号安全失败。                        |

完整 native Sessions 保留在私有环境；仅发布 `export-private-input-evidence.mjs` 的 allowlist 导出。对真实选用的模型 adapter 使用被动 wire probe，报告请求数量、正文可检查性、字节数及 canary 命中。检查 Session、Chat、审批、日志、错误和保留的 Spill 中的原值、URL 编码及 base64 canary。缺失正文或 Spill 文件属于证据不完整。Canary 文件、凭据状态、tailnet 标识和完整 traces 不进入 Git。

固定消费者只支持已核验的 HTTP-status 操作，不推导任意携带凭据的 Shell 命令、MCP server 或 transport。普通 Linux 文件访问仍需要明确的工作区权限。成功结论必须绑定实际安装版本和已观察的案例；CI 或开发终端请求不能替代真实 PersonaBot 路径。

## 复跑合成案例

按上述要求准备私有 Profile 和工作区权限后，在两个终端分别启动经核验的 launcher 与受控服务：

```bash
node scripts/dev-instance.mjs --home <private-DSH_HOME> --port 31395 --im-provider --json
node scripts/ask-secret-lifecycle-fixture.mjs 31396
```

停止同一 IM App 的其他接收器，在此隔离 Profile 完成既有 Pairing。在已授权私聊中，请真实 PersonaBot 为账号 `linux-demo` 请求必填 `endpoint`、`api_key`、`api_secret`，等待 Owner 在 Web 填写，然后各调用一次固定认证状态消费者，最后通过 `bridge_reply` 向同一已接纳来源仅报告 HTTP 状态和成功与否。该 IM 消息不要包含私密字段值。

使用 [CLI 验收指南](private-input-cli.md) 的 version-A 合成值填写 Web 卡，仅把 endpoint 端口改为 `31396`。通过既有审批卡批准携带引用的调用；两种消费者应返回 HTTP 200，原 IM 会话应收到非秘密结果。Fixture 的 `/evidence` 返回请求／认证／完成计数，不返回凭据；从可信 Host 终端通过 `/control` 切换 version B 或有界响应延迟，验证轮换和撤销。

请 PersonaBot 创建至少三分钟后触发的一次性 Bot Schedule。定时提示必须省略 `source_event_id`，复用已配置账号，调用两种固定消费者并向其 Web DM 报告。到期前只重启 launcher 的准确 Host，观察自然 `planned` firing，不使用 `scheduleRunNow`。为缺失和撤销账号分别创建定时案例，均不应打开无人值守私密卡。恢复前保留经过认证的 native Session 和 canonical firing 证据。[复验记录](../../research/2026-10-12-private-input-linux-qualification.md) 分开列出真实成功案例、失败尝试及剩余限制。

## 恢复接收器

核对进程身份和 DSH home 后，停止准确的 Linux Host 与 fixture。确认 Linux 接收器停止，再恢复原接收器。仅移除本任务新增的代理端点，对比剩余路由与启动前基线，并在恢复后核对正常回帖。私有证据留作向前修复；不得将保存了凭据的 Profile 降级为没有执行隔离的旧二进制。
