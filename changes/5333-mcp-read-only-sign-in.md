---
section: Changed
---

## en

- A remote MCP App connection such as PostHog can now be signed in Read only. The Host then asks the server only for its read permissions, so the server itself refuses changes, and every Bot that can use the account gets all of its tools. Read and write asks for everything, as before. A service that cannot be limited to Read says so when you connect it. Choose it when connecting, or change it later in Settings › App connections, which signs in again; CLI: `--access read|write` on `connector-connect`, `connector-mcp-add` and `connector-reconnect` ([#5333](https://github.com/BotHarness/DeepSeekBot/issues/5333)).

## zh

- PostHog 等远程 MCP 应用连接现在可以只读登录。Host 只向服务器申请读取权限，写入由服务器自己拒绝；能使用这个账号的 Bot 都能看到它的全部工具。读写会和以前一样申请全部权限。无法限制为只读的服务，连接时会直接提示。连接时选择，或之后在设置 › 应用连接里修改（会重新登录）；CLI：`connector-connect`、`connector-mcp-add` 和 `connector-reconnect` 的 `--access read|write`（[#5333](https://github.com/BotHarness/DeepSeekBot/issues/5333)）。
