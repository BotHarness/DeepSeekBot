---
section: Fixed
---

## en

- GenUI preview refusals preserve recognized Browser startup failure kinds and report cleanup failures without discarding an earlier refusal code or exposing process output and private profile paths ([#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)).
- Local Bot Browser shutdown waits for process and inherited stdio closure before releasing its profile; an unconfirmed shutdown fails explicitly and retains ownership instead of reporting success immediately after a kill signal ([#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)).

## zh

- GenUI 预览拒绝保留已识别的 Browser 启动失败分类，并明确报告收尾失败，不丢弃此前的拒绝码，也不暴露进程输出或私有 Profile 路径（[#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)）。
- 本地 Bot Browser 收尾会等待进程及继承的标准流关闭后再释放 Profile；无法确认收尾时明确失败并保留所有权，不再将已发送终止信号误报为停止成功（[#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)）。
