---
section: Fixed
---

## en

- Someone who knows a Host's Connect address can no longer keep its connections busy without signing in. Connections that haven't signed in a device close after 30 seconds on every route, and Connect and the Host's own HTTPS address each allow at most 8 of them at a time, so Connect, private tunnels, the private relay and SSH keep working ([#5234](https://github.com/BotHarness/DeepSeekBot/issues/5234)).

## zh

- 知道 Host 的 Connect 地址的人，无法再在不登录的情况下占满它的连接。现在所有路径上，尚未登录设备的连接都会在 30 秒后关闭；Connect 和 Host 自己的 HTTPS 地址各自最多同时保留 8 条这样的连接。因此 Connect、私有隧道、私有中继和 SSH 都能继续正常使用（[#5234](https://github.com/BotHarness/DeepSeekBot/issues/5234)）。
