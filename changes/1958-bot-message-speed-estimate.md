---
section: Added
---

## en

- Every new finished Bot reply shows its generation speed in a small footer label such as `≈ 42 tok/s · estimated`. Provider-reported output tokens are used when available and drop the `estimated` marker; otherwise tokens are estimated from the reply text and the stream’s generation window, excluding storage, tool execution, and delivery waits. Messages without a usable measurement, including older history and attachment-only replies, show nothing. The composer footer shows the average speed of up to 20 measured Bot replies among the conversation's latest 200 messages, such as `avg 56 tok/s` ([#1958](https://github.com/BotHarness/DeepSeekBot/issues/1958)).

## zh

- 每条新完成的 Bot 回复会在消息底部显示一个小标签，例如 `≈ 42 tok/s · 估算`。Provider 上报了输出 token 时直接使用并去掉「估算」标记；否则按回复文本估算 token，并用模型流的生成时间窗计算，排除存储、工具执行和发送等待。没有可用测量值的消息——包括历史消息和只有附件、没有正文的回复——不显示任何内容。输入框底部显示本会话最近 200 条消息中至多 20 条有测量值的 Bot 回复的平均速度，例如 `平均 56 tok/s`（[#1958](https://github.com/BotHarness/DeepSeekBot/issues/1958)）。
