---
section: Changed
---

## en

- Bots can now hand work to each other for up to 128 hops after each of your messages (was 32), so multi-step chains like you → A → B → C run without you nudging them along. You can change the limit in Settings → Messaging or with `deepseekbot settings-set botharness-client`. When a chain does run out, the sending Bot's message is refused and the Bot is told why, instead of the message landing in the colleague's Inbox without waking it ([#3409](https://github.com/BotHarness/DeepSeekBot/issues/3409)).

## zh

- 你每发一条消息后，Bot 之间最多可以互相传递 128 跳（原来是 32），人 → A → B → C 这样的多步协作不用你反复催就能走完。上限可以在「设置 → 消息」或用 `deepseekbot settings-set botharness-client` 调整。真的用完时，发送方 Bot 的消息会被直接拒绝并告知原因，而不是悄悄进了对方信箱却不唤醒（[#3409](https://github.com/BotHarness/DeepSeekBot/issues/3409)）。
