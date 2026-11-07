---
section: Fixed
---

## en

- Deleting a Bot now atomically clears its Group memberships and ownership; stale members are hidden on Group reads, repaired on Host restart and can be removed without a live Bot profile ([#3635](https://github.com/BotHarness/DeepSeekBot/issues/3635)).

## zh

- 删除 Bot 时会原子清理其所有群成员和群主引用；失效成员在读取群资料时隐藏，历史残留会在 Host 重启时修复，也可直接移出，不再要求 Bot 本体仍存在（[#3635](https://github.com/BotHarness/DeepSeekBot/issues/3635)）。
