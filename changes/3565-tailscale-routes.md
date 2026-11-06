---
section: Fixed
---

## en

- Tailscale publishing now updates its owned HTTPS address in place after a Host port change, preserves the previous route on a refused update, and reports unresponsive old addresses in Connections and the CLI without deleting unrelated services ([#3565](https://github.com/BotHarness/DeepSeekBot/issues/3565), [#3566](https://github.com/BotHarness/DeepSeekBot/issues/3566)).
- Tailscale commands now run without a console window on Windows, avoiding startup stalls that made a running service appear stopped ([#3565](https://github.com/BotHarness/DeepSeekBot/issues/3565)).

## zh

- 修复 Host 端口变化后启用 Tailscale 先删除旧规则的问题：现在原位更新自有 HTTPS 地址，更新被拒绝时保留旧规则；连接设置和 CLI 会提示未响应的旧地址，不删除其他服务的规则（[#3565](https://github.com/BotHarness/DeepSeekBot/issues/3565)、[#3566](https://github.com/BotHarness/DeepSeekBot/issues/3566)）。
- Windows 上的 Tailscale 命令不再创建控制台窗口，避免启动阻塞导致运行中的服务被误报为已停止（[#3565](https://github.com/BotHarness/DeepSeekBot/issues/3565)）。
