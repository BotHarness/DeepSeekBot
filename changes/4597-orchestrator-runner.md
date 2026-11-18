---
section: Changed
---

## en

- When a Subscription Engine such as Codex runs a Bot's Orchestrator, the DM header now shows that engine and its subscription account instead of the unused DSH model, and Bot summaries carry it as `orchestratorRunner`. Engine Sessions get a readable title from the Human's message instead of the raw envelope, and Session detail shows each incoming message's text with a small source label (Direct message, Group message, Bot message, Inbox) instead of its Source Event, Channel and Message IDs ([#4597](https://github.com/BotHarness/DeepSeekBot/issues/4597), [#4598](https://github.com/BotHarness/DeepSeekBot/issues/4598)).

## zh

- 当 Codex 等订阅引擎运行 Bot 的 Orchestrator 时，私聊顶部改为显示该引擎和订阅账号，不再显示没在使用的 DSH 模型，Bot 摘要也通过 `orchestratorRunner` 带出这一信息。引擎 Session 的标题改用 Human 消息的正文，不再是原始封装文本；Session 详情里每条入站消息只显示正文，并在上方用小标签标明来源（私聊消息、群聊消息、Bot 私信、收件箱），不再显示 Source Event、Channel 和 Message ID（[#4597](https://github.com/BotHarness/DeepSeekBot/issues/4597)、[#4598](https://github.com/BotHarness/DeepSeekBot/issues/4598)）。
