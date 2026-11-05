---
section: Fixed
---

## en

- Loading older messages in a long conversation no longer remounts the whole loaded history for one frame. The timeline sizes regrouped history from the messages it has already measured, so each older page mounts only the new page and what is near the screen, however much is already loaded ([#3277](https://github.com/BotHarness/DeepSeekBot/issues/3277)).

## zh

- 长会话往上加载更早消息时，不再把已加载的全部历史重新挂载一帧。重新分组后的历史改用已测量过的消息高度来估算，每加载一页只挂载新的一页和屏幕附近的内容，不再随已加载的消息数增长（[#3277](https://github.com/BotHarness/DeepSeekBot/issues/3277)）。
