---
section: Fixed
---

## en

- A Bot restored from an Environment backup keeps replying after you change its Model Preset or customize its model in the Bot Profile. Before, the restore kept checking the model authorized when the Bot was activated, so any later model change made every message fail with an activation error, and compact-and-retry hit the same wall. Activating the Bot now completes its restore; the Host still checks that each model is usable before a Turn. While a restored Bot is not yet active, the error now says to open Settings → Environment backup, choose Authorize model, then Activate Bot ([#2993](https://github.com/BotHarness/DeepSeekBot/issues/2993)).

## zh

- 从环境备份恢复的 Bot，在 Bot 资料里更换模型预设或自定义模型后，会继续正常回复。以前恢复流程会一直比对激活时授权的模型，激活后任何模型修改都会让每条消息因激活错误而失败，「压缩后重试」也同样失败。现在激活 Bot 即完成恢复，Host 在每个回合前仍会检查模型是否可用。恢复后尚未激活的 Bot，错误信息会提示前往「设置 → 环境备份」，点击「授权模型」，再点击「激活 Bot」（[#2993](https://github.com/BotHarness/DeepSeekBot/issues/2993)）。
