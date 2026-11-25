---
section: Fixed
---

## en

- Someone who knows a Host's Connect address can no longer use up all of its connections without signing in. On every route, a connection that hasn't signed in a device, and isn't waiting for the Owner to approve a pairing code, closes after 30 seconds. Connect and the Host's own HTTPS address each allow at most 8 such connections at a time, so they can no longer take every connection away from private tunnels, the private relay and SSH. Holding 8 idle connections can still briefly refuse new Connect connections ([#5234](https://github.com/BotHarness/DeepSeekBot/issues/5234)).

## zh

- 知道 Host 的 Connect 地址的人，无法再在不登录的情况下占满它的全部连接。现在所有路径上，既没有登录设备、也不在等待 Owner 批准配对码的连接，都会在 30 秒后关闭。Connect 和 Host 自己的 HTTPS 地址各自最多同时保留 8 条这样的连接，因此它们不会再占满全部连接，让私有隧道、私有中继和 SSH 无法使用。但占住 8 条空闲连接，仍可能让新的 Connect 连接暂时被拒绝（[#5234](https://github.com/BotHarness/DeepSeekBot/issues/5234)）。
