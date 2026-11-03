---
section: Fixed
---

## en

- Loading older messages in a long conversation no longer remounts the whole loaded history for one frame. Message groups now keep their identity when earlier history arrives, so each older page costs about the same however much is already loaded ([#3277](https://github.com/BotHarness/DeepSeekBot/issues/3277)).

## zh

- 长会话往上加载更早消息时，不再把已加载的全部历史重新挂载一帧。更早的历史加入后，消息分组保持原来的身份，所以每加载一页的开销基本固定，不再随已加载的消息数增长（[#3277](https://github.com/BotHarness/DeepSeekBot/issues/3277)）。
