---
section: Fixed
---

## en

- Saving the default model no longer replaces a default Routing Group that another device set in the meantime, and a Routing Group deleted while a Bot plan, Preset or the default model is being saved makes the save fail instead of keeping a missing group ([#4497](https://github.com/BotHarness/DeepSeekBot/issues/4497)).

## zh

- 保存默认模型时，若其他设备刚改了默认路由组，不会再被覆盖；保存 Bot 计划、预设或默认模型的过程中路由组被删除时，保存会失败，不会留下已删除的组（[#4497](https://github.com/BotHarness/DeepSeekBot/issues/4497)）。
