---
section: Added
---

## en

- Added explicit Group peer yielding: a PersonaBot can drop a redundant held reply with references to peer answers it actually read, while preserving useful additions and new direct questions; direct CLI and traces distinguish deliberate yielding from a failed send, with Inbox completion still explicit. A completed peer answer can also be handled silently before creating a draft, and reply guidance keeps internal yielding decisions out of the conversation ([#2054](https://github.com/BotHarness/DeepSeekBot/issues/2054)).

## zh

- 新增群聊同伴让话记录：PersonaBot 可引用实际读过的同伴答复，放弃重复的待复核回复，同时保留有价值补充和新直接问题；CLI 与 trace 可区分主动让话和发送失败，Inbox 仍需显式结清。同伴已完整回答时可不创建草稿而静默完成，回复指引也将内部让话判断留在群聊消息之外（[#2054](https://github.com/BotHarness/DeepSeekBot/issues/2054)）。
