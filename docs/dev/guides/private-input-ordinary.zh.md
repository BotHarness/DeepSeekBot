# 在普通 Profile 中使用私密输入

自 [ADR-0189](../../adr/0189-secret-input-is-available-in-ordinary-profiles.md) 起，PersonaBot 在任何 Profile 中都可以询问密钥，不需要 Docker，也不需要显式开启。

## Bot 可以做什么

| 工具                 | 作用                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ask_secret`         | 在请求所在的 Channel 发出输入卡片。只有 Owner 能填写。Bot 拿到的是 `private:<id>:<字段>` 引用，拿不到值。                                                            |
| `secret_http`        | 调用 HTTP 接口。请求由 Host 发往 Owner 在卡片里填写的地址；Bot 只能指定该地址下的路径、方法，以及用 `{{字段}}` 标出密钥在请求头、查询参数或请求体中的位置。          |
| `protected_cli`      | 固定的 `http-status-v1` 检查：发一次 GET，只返回状态码。                                                                                                             |
| `secret_cli`         | 带着密钥运行一个已安装的命令行工具，密钥只放进它的环境变量。Host 不经 shell 直接启动程序，工作目录是 Bot 的工作文件夹，受 Shell 沙箱约束，环境变量是干净的。         |
| `secret_mcp_connect` | 为这个 Bot 的聊天会话启动一个 MCP 服务，密钥放进它的环境变量；它的工具以 `mcp__<server_name>__<工具>` 出现。`secret_mcp_disconnect` 用来断开，或列出当前连着的服务。 |

每个使用方都需要 Human 执行审批。审批卡上只有引用和占位符，没有值。`secret_cli` 卡片提供“批准一次”“总是允许此类”和“拒绝”。“此类”指程序名、账号和这组环境变量名，参数不算在内。“总是允许”会为这个 Bot 和角色保存一条可撤销的 `secret-cli` 规则，之后同类调用无论参数如何都不再出卡片；换了程序、账号或变量名会出新卡片。精确规则和全部不透明规则都不覆盖 `secret_cli`（[ADR-0191](../../adr/0191-a-bot-runs-a-command-line-tool-with-owner-secrets-per-approved-call.md)、[ADR-0208](../../adr/0208-secret-cli-can-be-always-allowed-per-program-and-account.md)）。

## 密钥靠什么保护

- 值保存在 DSH 原生凭据存储中，绑定到发起请求的 Bot 和账号，其他 Bot 无法使用。
- Channel 历史里只有请求和引用。
- `secret_http` 只会把密钥发往 Owner 填写的地址。拒绝跳转；只有本机地址允许明文 http。地址可以自带查询串，它会保留在每次请求上，并和密钥一样在返回内容里被掩码。Host 在发送前拒绝的请求会以 `refused` 加原因返回，Bot 可以据此解释。返回文本中的密钥会以原文、base64、URL 编码三种形式被掩码；掩码只是防止意外回显，不是安全边界。
- Agent 读不到凭据存储。DSH 把每条 Shell 命令放在系统沙箱中运行，Host 额外加一条“不可读取凭据存储”的规则：macOS 上是 Seatbelt 规则，Linux 的 bwrap 下用空文件遮盖。针对该存储的 Agent 文件工具，以及点名它的 Shell 命令，在弹出审批卡之前就会被拒绝。

## 限制

以下三种情况没有沙箱规则，只剩按命令文本拒绝这一层，间接访问该文件的命令识别不出来：

- 以 `danger-full-access` 模式运行的命令，DSH 不对它使用沙箱；
- DSH 使用 Landlock 而不是 bwrap 的 Linux 主机；
- Windows，DSH 的 Windows 沙箱不限制读取。

某个沙箱 runner 第一次没能加上规则时，Host 会记录一条警告。DSH 升级如果改变了所依赖的 runner 命令行，`scripts/test/dsh-sandbox-shape.test.mjs` 会失败，届时需要调整 `credentials/store-guard.ts`。

`secret_cli` 会把密钥交给它启动的程序。如果某个工具能打印或转发自己的凭据，而一次被批准的调用恰好要求这么做，它就会照做；把 shell 和解释器拒绝掉只是堵住最直接的路，不是安全边界。请在每张卡片上核对程序名和参数。有了“总是允许”规则后就没有卡片可核对，同类调用可能让程序打印凭据；只对你信任任何参数的工具选“总是允许”。

## 命令行工具

让 Bot 使用一个从环境变量读取凭据的工具，例如：

```text
工具 mytool 读取 MYTOOL_TOKEN。请用 ask_secret 向我要这个 token（账号叫“mytool token”），
然后运行：mytool status
```

Bot 会用 `program: mytool`、`args: ["status"]`、`env: [{ name: "MYTOOL_TOKEN", value: "{{token}}" }]` 调用 `secret_cli`。预期：审批卡写明程序和参数，提供“批准一次”“总是允许此类”和“拒绝”；批准后 Bot 报告退出码和输出，token 显示为 `[secret]`。让它用这种方式运行 `sh -c 'echo $MYTOOL_TOKEN'` 会在弹出卡片之前被拒绝。

## MCP 服务

让 Bot 接上一个从环境变量读取凭据的服务，例如：

```text
接上 GitHub 的 MCP 服务：npx -y @modelcontextprotocol/server-github，它读取
GITHUB_PERSONAL_ACCESS_TOKEN。请先用 ask_secret 向我要这个 token。
```

Bot 会调用 `secret_mcp_connect`。预期：审批卡写明启动程序和参数，说明这个程序会持续运行，并提供“仅批准这一次”“批准并记住”“拒绝”三个选择。批准后 Bot 列出该服务的工具；之后每次调用工具按平常的方式询问。选“仅批准这一次”时，服务在 `secret_mcp_disconnect`、账号被撤销或 Host 重启时停止，重新连接需要再次批准。选“批准并记住”时，这个 Bot 的聊天会话每次启动都会自动把它启动起来，并且它会出现在每个 Bot 设置的“密钥”里（[ADR-0198](../../adr/0198-a-remembered-secret-mcp-server-serves-every-personabot.md)）：在另一个 Bot 的设置里打开开关，那个 Bot 就能使用它，运行的是自己的一份，用的是配置它的那个 Bot 的密钥。在任一 Bot 的设置里移除，就是对所有 Bot 移除（[ADR-0196](../../adr/0196-approved-secret-mcp-servers-can-be-remembered.md)）。派出的事项用不了它（[ADR-0195](../../adr/0195-a-bot-starts-an-mcp-server-with-owner-secrets-per-approved-start.md)）。

请把 MCP 服务当作你安装并信任的程序，这和其他 MCP 客户端的做法一致。除了拿到密钥，它还能把自己的说明写进 Bot 的系统提示，它的工具描述和返回结果也会交给模型。服务里的文字，或者它返回的数据（比如别人写的一个 issue），都可能引导 Bot 做事。每次工具调用仍然需要审批，除非你保存了规则或开了完全访问。

不依赖真实服务的本地验证：启动 `node scripts/ask-secret-fixture.mjs 31381`，让 Bot 用 `STATUS_ENDPOINT`、`STATUS_API_KEY`、`STATUS_API_SECRET` 接上 `node <仓库>/scripts/secret-mcp-fixture.mjs`，然后调用 `check_status`（应为 200）和 `describe_setup`（key 应显示为 `[secret]`）。

## Owner CLI

`deepseekbot` 的在线命令在普通 Profile 中和 Web Chat 行为一致：`ask-secret-status`、`ask-secret-submit --values-stdin`、`ask-secret-cancel`、`ask-secret-account-status`、`ask-secret-replace`、`ask-secret-revoke`、`ask-secret-accounts`。`secret_http` 的审批用 `tool-approval-decide` 决定。见 [CLI 参考](../../bot-cli.zh.md)。

## 本地验证

只使用隔离的 DSH home 和合成数据。

```bash
pnpm install --frozen-lockfile
pnpm build
node scripts/dev-instance.mjs --home <隔离的 DSH_HOME> --port 31380
node scripts/ask-secret-fixture.mjs 31381
```

打开输出的 Web 地址，选择一个模型可用的 PersonaBot，在它的私聊中发送，或在群里 @ 它：

```text
请用 ask_secret 为账号 synthetic-http 请求三个必填字段：
endpoint（标签 接口地址）、api_key（标签 API key）、api_secret（标签 API secret）。
我提交后，用 secret_http 发一次 GET，路径 /status?marker=SYNTHETIC-1380-url-A，
请求头 x-api-key 用 {{api_key}}，x-api-secret 用 {{api_secret}}。
告诉我 HTTP 状态码和返回内容。
```

在卡片中填写这些合成值：

| 字段       | 合成值                    |
| ---------- | ------------------------- |
| 接口地址   | `http://127.0.0.1:31381`  |
| API key    | `SYNTHETIC-1380-key-A`    |
| API secret | `SYNTHETIC-1380-secret-A` |

预期：卡片出现在你提问的 Channel；提交后字段清空；`secret_http` 的审批卡显示路径、占位符和 `private:` 引用；Bot 报告状态码 200，返回内容里的 key、secret 及其 base64 形式显示为 `[secret]`；`http://127.0.0.1:31381/evidence` 的 `authenticated` 加一；任何 Channel 消息中都不出现这两个合成密钥。

验证存储保护：让 Bot 执行 `wc -c <隔离的 DSH_HOME>/.credentials.yaml`，会在弹出审批卡之前被拒绝。间接指向该文件的命令会触发沙箱规则：macOS 上报 `Operation not permitted`。bwrap 下读取会报 `Permission denied`；这一点在 Linux 容器里用 DSH 生成的命令行实跑过（只读和 workspace-write 两种策略），但没有在 Linux 上跑完整的 Host。
