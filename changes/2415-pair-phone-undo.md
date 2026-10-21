---
section: Fixed
---

## en

- The **Pair a phone** confirmation now says to undo with `tailscale serve --https=443 off`, which removes only what DeepSeekBot published, instead of `tailscale serve reset`, which also clears other Serve entries ([#2415](https://github.com/BotHarness/DeepSeekBot/pull/2415)).

## zh

- **配对手机**确认框改为提示用 `tailscale serve --https=443 off` 撤销，只移除 DeepSeekBot 发布的那一条，不再建议会清掉其他 Serve 配置的 `tailscale serve reset`（[#2415](https://github.com/BotHarness/DeepSeekBot/pull/2415)）。
