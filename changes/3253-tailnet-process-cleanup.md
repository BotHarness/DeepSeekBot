---
section: Fixed
---

## en

- Avoid sending a termination signal when the Tailscale watcher could not start, while still waiting for started watchers to exit during Host shutdown ([#3253](https://github.com/BotHarness/DeepSeekBot/issues/3253)).

## zh

- Tailscale 监听进程未能启动时，不再尝试向其发送终止信号；Host 关闭时仍会等待已启动的监听进程退出（[#3253](https://github.com/BotHarness/DeepSeekBot/issues/3253)）。
