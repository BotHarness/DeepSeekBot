---
section: Added
---

## en

- App connections can now use remote MCP servers that connect by signing in, such as PostHog, Notion, Linear and Sentry, without a Composio key. Search featured servers and the public MCP Registry, or paste a server's https address, in Settings › App connections and the Marketplace; several accounts per server work, and each Bot gets Read or Read and write access to each account. The Host refreshes the sign-in on its own. CLI: `deepseekbot connector-mcp-search`, `connector-mcp-add <url>` and `connector-mcp-finish <url>` ([#5333](https://github.com/BotHarness/DeepSeekBot/issues/5333)).

## zh

- 应用连接现在可以接入用账号登录的远程 MCP 服务器，例如 PostHog、Notion、Linear 和 Sentry，不需要 Composio key。在设置 › 应用连接和市场里可以搜索常用服务器和公开的 MCP Registry，也可以粘贴服务器的 https 地址；同一服务器可以连多个账号，每个 Bot 对每个账号可设为只读或可读写。Host 会自动续期登录。CLI：`deepseekbot connector-mcp-search`、`connector-mcp-add <url>` 和 `connector-mcp-finish <url>`（[#5333](https://github.com/BotHarness/DeepSeekBot/issues/5333)）。
