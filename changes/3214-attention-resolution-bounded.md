---
section: Fixed
---

## en

- Checking whether a pending question, tool approval, auto-rejection, private input or workspace grant request has been answered now uses an index instead of reading the whole Channel history for each card, and a Bot's activity chart in its DM reads only the requested weeks of inbox activity instead of every record the Bot has received ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- 判断待处理的提问、工具审批、自动拒绝、私密输入和工作区授权请求是否已经处理时，现在改为按索引查找，不再为每张卡片读取整个频道的历史；DM 里的 Bot 活动图只读取所选几周的收件记录，不再读取这个 Bot 收到过的全部记录（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
