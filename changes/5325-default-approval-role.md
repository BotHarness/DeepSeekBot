---
section: Added
---

## en

- A Bot can now have a default approval role. When a reviewer replies only "approve" in IM, the request gets that role. In a group, the list of roles is no longer posted in the conversation; it is sent to the reviewer in a private message, and the reviewer can answer there. Set it under IM pairing → Roles, or with `deepseekbot sender-access` and `{"kind":"default-role",…}` ([#5325](https://github.com/BotHarness/DeepSeekBot/issues/5325)).

## zh

- Bot 现在可以设置默认批准角色。审核人在 IM 里只回复「同意」时，申请会获得这个角色。在群里不再公开列出可选角色，而是私信发给审核人，审核人可以直接在私信里回复。可在「IM 配对 → 角色」中设置，或使用 `deepseekbot sender-access` 传入 `{"kind":"default-role",…}`（[#5325](https://github.com/BotHarness/DeepSeekBot/issues/5325)）。
