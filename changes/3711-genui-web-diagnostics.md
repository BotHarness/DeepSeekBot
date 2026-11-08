---
section: Fixed
---

## en

- Clearing message content also removes its retained GenUI private drafts and submission attempts, including views that are not open; late save responses cannot restore them ([#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)).

- GenUI continuations keep the Human's readable request in the ordinary message body. Validated, bounded model context remains in the same canonical Source Event and reaches both immediate and recovered Bot turns without displaying developer JSON in new messages ([#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)).

- GenUI preview refusals preserve recognized Browser startup failure kinds and report cleanup failures without discarding an earlier refusal code or exposing process output and private profile paths ([#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)).
- Local Bot Browser shutdown waits for process and inherited stdio closure before releasing its profile; an unconfirmed shutdown fails explicitly and retains ownership instead of reporting success immediately after a kill signal ([#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)).
- GenUI's default table style keeps words intact inside an opt-in horizontal scroll region on narrow screens; the maintained interactive example reuses row identities so selecting a row does not discard keyboard focus ([#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)).

## zh

- 清除消息内容时，同时移除其缓存的 GenUI 私有草稿和提交尝试，包括当前未打开的视图；迟到的保存响应不会恢复这些状态（[#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)）。

- GenUI 续接将 Human 的可读请求保留为普通消息正文；经过校验的有界模型上下文仍属于同一条规范 Source Event，并传递给即时及恢复的 Bot 回合，新消息不再显示开发者 JSON（[#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)）。

- GenUI 预览拒绝保留已识别的 Browser 启动失败分类，并明确报告收尾失败，不丢弃此前的拒绝码，也不暴露进程输出或私有 Profile 路径（[#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)）。
- 本地 Bot Browser 收尾会等待进程及继承的标准流关闭后再释放 Profile；无法确认收尾时明确失败并保留所有权，不再将已发送终止信号误报为停止成功（[#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)）。
- GenUI 默认表格样式在窄屏保留完整词语，并提供可选的横向滚动区域；维护的交互示例复用表格行身份，避免选中一行时丢失键盘焦点（[#3711](https://github.com/BotHarness/DeepSeekBot/issues/3711)）。
