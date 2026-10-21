---
section: Changed
---

## en

- The conversation view no longer re-renders when a Bot outside the current Channel reports Activity. It still updates for the DM Bot, group members and message authors, and for any Bot's name or avatar change. The group Work panel also ignores Activity it does not show ([#2449](https://github.com/BotHarness/DeepSeekBot/issues/2449)).

## zh

- 与当前频道无关的 Bot 推送 Activity 时，会话视图不再重新渲染。私聊对象、群成员和消息作者的 Activity 变化，以及任意 Bot 的名称或头像变化，仍会正常更新。群聊“工作”面板也不再因为它不显示的 Activity 而重绘（[#2449](https://github.com/BotHarness/DeepSeekBot/issues/2449)）。
