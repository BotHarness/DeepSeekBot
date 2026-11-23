---
section: Fixed
---

## en

- Bot Channel searches keep the newest matches across joined Channels and continue budget-limited reads from the original page. Refused Group-owner invitations leave Team adder records intact, and keyed Group sends check access before saving the message. Ignoring a queued Human DM settles its Source Event, and a successful direct tool call still returns its result when the history preview cannot represent it. ([#4955](https://github.com/BotHarness/DeepSeekBot/issues/4955))

## zh

- Bot 跨已加入的会话搜索时会保留最新的匹配消息，并在达到输出上限时从原有结果页继续读取。因 Bot 不是群主而被拒绝的邀请不会改动 Team 的邀请人记录，带去重键的群消息会在保存前校验权限。忽略排队中的人类私聊消息会结算对应的来源事件，直接工具调用成功后，即使历史记录无法显示其结果，仍会返回原始结果。([#4955](https://github.com/BotHarness/DeepSeekBot/issues/4955))
