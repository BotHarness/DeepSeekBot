---
section: Added
---

## en

- When the Approval Reviewer rejects a call, it now becomes a Human Inbox item showing the call, the template and the reason. **Allow this once anyway** lets that exact call run once: the Bot is told it may retry, and later calls are still reviewed. After 3 rejections in a row, or 20 in one Session, auto approval pauses for that Session and every request posts a card until you approve one; the Channel shows when it pauses and resumes. The CLI lists these items with `deepseekbot inbox --kind auto-rejection` and allows one with `deepseekbot inbox-allow-once` ([#1826](https://github.com/BotHarness/DeepSeekBot/issues/1826)).

## zh

- 审批员拒绝的调用现在会成为 Human Inbox 里的一条待办，显示调用、模板和理由。**仍然允许这一次**只放行那一次完全相同的调用：Bot 会收到通知并可以重试，之后的调用仍按模板审核。同一会话连续 3 次被拒绝，或累计 20 次后，此会话的自动审批暂停，之后每个请求都发卡片，直到你批准一次；暂停和恢复都会在 Channel 里显示。CLI 用 `deepseekbot inbox --kind auto-rejection` 列出这些条目，用 `deepseekbot inbox-allow-once` 放行其中一条（[#1826](https://github.com/BotHarness/DeepSeekBot/issues/1826)）。
