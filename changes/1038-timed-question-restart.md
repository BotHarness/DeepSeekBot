---
section: Fixed
---

## en

- A question card that a Bot left open while it went on with other work now survives a Host restart. The card stays answerable in its DM or Group and in the Human Inbox, and the answer resumes the Bot's own conversation where it asked. Before, the card silently expired after a restart. A card also stays answerable when DSH releases the Bot's agent between tasks ([#1038](https://github.com/BotHarness/DeepSeekBot/issues/1038)).

## zh

- Bot 提问后继续处理其他事情时留下的问题卡，在 Host 重启后仍然可以回答。卡片在原来的私聊或群组以及 Human 收件箱中保持可答，回答后 Bot 会回到当初提问的那个会话继续。以前重启后这张卡会无声失效。DSH 在两次任务之间释放 Bot 的 Agent 时，卡片同样保持可答（[#1038](https://github.com/BotHarness/DeepSeekBot/issues/1038)）。
