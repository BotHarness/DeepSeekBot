---
section: Fixed
---

## en

- The Host no longer hangs on shutdown or plugin reload when `tailscale` on PATH is a shell wrapper that starts the real binary as a child (as some macOS installs do): the tailnet watcher now runs in its own process group, stopping it also stops the real Tailscale process, and disposal no longer waits on a pipe a leftover process holds open ([#3329](https://github.com/BotHarness/DeepSeekBot/pull/3329)).

## zh

- 当 PATH 上的 `tailscale` 是一个以子进程方式启动真实程序的 shell 包装脚本时（部分 macOS 安装如此），Host 关闭或插件重载不再卡住：tailnet 监听进程改为在独立进程组中运行，停止时会一并结束真实的 Tailscale 进程，释放时也不再等待残留进程占用的管道（[#3329](https://github.com/BotHarness/DeepSeekBot/pull/3329)）。
