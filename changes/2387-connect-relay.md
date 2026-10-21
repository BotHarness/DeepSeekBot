---
section: Added
---

## en

- Added the DeepSeekBot Connect relay Worker (`packages/connect-relay`): signed-in WorkOS accounts link up to five Hosts, each gets a gateway-only Cloudflare Tunnel on `<id>.deepseekbot.dev`, and tunnels whose Host stays offline are reclaimed ([#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387)).

## zh

- 新增DeepSeekBot Connect 的 relay Worker（`packages/connect-relay`）：登录 WorkOS 的账号最多关联 5 台 Host，每台分到一个只放行设备网关的 Cloudflare Tunnel（`<id>.deepseekbot.dev`），Host 长时间离线时回收 tunnel（[#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387)）。
