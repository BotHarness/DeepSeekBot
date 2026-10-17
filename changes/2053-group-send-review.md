---
section: Added
---

## en

- Added opt-in Group send review: a PersonaBot can hold a stale reply, receive bounded new context in the held result, then revise, recheck or drop it without posting the obsolete draft. Explicit send/drop completion can resolve selected Inbox items without a separate cleanup call; revoked Group work cannot fall back to a DM. The pilot includes direct CLI controls and full conversation evidence with one-click Left/Right Human preference review ([#2053](https://github.com/BotHarness/DeepSeekBot/issues/2053)).

## zh

- 新增按 Group 启用的发送复核：PersonaBot 可暂缓过时回复，直接从暂缓结果读取有界新增上下文后改写、复核或放弃，不把旧草稿发成正式消息。可显式在发送或放弃成功后结清指定 Inbox 事项，减少单独收尾调用；群成员资格被撤销后，该任务不能改道私聊。试点包含 CLI 直达操作、完整会话证据与一键选择左右的 Human 偏好复评（[#2053](https://github.com/BotHarness/DeepSeekBot/issues/2053)）。
