---
section: Changed
---

## en

- A remote MCP App connection such as PostHog now shows whether its sign-in is Read or Read and write. You choose what to allow on the service's own consent page, and the Host records what the service actually granted; the service enforces it for every Bot that can use the account, and each such Bot gets all of the account's tools. To change it, sign in again in Settings › App connections or with `connector-reconnect`. An account connected before this change refuses Bots that have Read until you reconnect it once ([#5333](https://github.com/BotHarness/DeepSeekBot/issues/5333)).

## zh

- PostHog 等远程 MCP 应用连接现在会显示登录权限是只读还是读写。允许哪些权限在服务自己的授权页上选，Host 记录服务实际给出的权限；由服务对所有能使用这个账号的 Bot 执行，这些 Bot 都能看到账号的全部工具。要修改，在设置 › 应用连接里重新登录，或使用 `connector-reconnect`。这次更新之前连接的账号，只读的 Bot 会被拒绝，重新连接一次即可（[#5333](https://github.com/BotHarness/DeepSeekBot/issues/5333)）。
