---
section: Changed
---

## en

- **Hosted Connect stays inside its tunnel quota**: the relay stops creating tunnels at 900 live ones and slows each account to about 20 new requests a minute, so open sign-up can't exhaust Cloudflare's 1,000 tunnels ([#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387)).

## zh

- **托管 Connect 不会超出 tunnel 配额**：relay 在线 tunnel 达到 900 个时不再新建，每个账号每分钟约 20 次新建请求，开放注册也不会占满 Cloudflare 的 1000 个 tunnel 名额（[#2387](https://github.com/BotHarness/DeepSeekBot/issues/2387)）。
