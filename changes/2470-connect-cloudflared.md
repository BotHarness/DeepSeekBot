---
section: Added
---

## en

- Connect no longer needs a separate `cloudflared` install. The Host runs a pinned `cloudflared` from an optional per-platform package installed with DeepSeekBot. If that package is missing, the Host downloads the same pinned release once into the profile and checks its SHA-256 first. `connect-status` reports `cloudflared-download-failed` or `cloudflared-hash-mismatch` when that download is refused, and shows which `cloudflared` is in use ([#2470](https://github.com/BotHarness/DeepSeekBot/issues/2470)).

## zh

- Connect 不再需要另装 `cloudflared`。Host 运行随 DeepSeekBot 安装的平台可选包里的固定版本 `cloudflared`；缺少这个包时，Host 会把同一固定版本下载到 profile 一次，并先核对 SHA-256。下载被拒绝时，`connect-status` 报告 `cloudflared-download-failed` 或 `cloudflared-hash-mismatch`，并显示当前用的是哪个 `cloudflared`（[#2470](https://github.com/BotHarness/DeepSeekBot/issues/2470)）。
