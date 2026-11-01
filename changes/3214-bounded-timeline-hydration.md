---
section: Fixed
---

## en

- Loading the latest, unread-anchor and history pages hydrates only the selected message window and its visible reply/grant dependencies instead of every message in the Channel, reducing work for long histories while retaining read boundaries and message metadata ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- 读取最新消息、未读位置和历史分页时，只水合当前消息窗口及其可见的回复、授权依赖，不再逐条处理整个 Channel 的历史；保留阅读边界和消息元数据，减少长历史的加载开销（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
