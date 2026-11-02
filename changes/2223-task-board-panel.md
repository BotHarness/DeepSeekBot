---
section: Added
---

## en

- Added a read-only **Task board** panel to the Channel sidebar: it follows the current chat’s work grouped per Bot, shows `x/y steps` progress and the step list of each row, opens from the icon beside the chat header’s settings gear, stays closed by default, and remembers each chat’s open state. In a Bot DM the Bot’s own main Session appears as a row next to its Assignments, and its steps are read through the existing assignment timeline surface, so no new bridge method or CLI command is introduced. Closing the panel unmounts it, so it costs no requests and no timers. Refs [#2223](https://github.com/BotHarness/DeepSeekBot/issues/2223).

## zh

- Channel sidebar 新增只读的 **任务看板** 面板：按 Bot 分组跟进当前聊天的工作，显示 `x/y 步` 进度与每行的步骤列表，入口是聊天头部齿轮旁的图标，默认关闭，并按聊天记住开合状态。在 Bot 私聊里，Bot 自己的主会话会与它的 Assignment 并列成一行，其步骤复用既有的 assignment timeline 能力读取，因此不新增 bridge 方法、也不新增 CLI 命令。关闭面板即卸载，不产生请求与计时器。Refs [#2223](https://github.com/BotHarness/DeepSeekBot/issues/2223)。
