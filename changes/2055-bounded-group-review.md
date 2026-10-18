---
section: Added
---

## en

- Group evaluation now waits for observed and snoozed Inbox work to settle before ending early, retaining unfinished responsibility and unknown future cost separately from reply correctness ([#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)).

- Bounded Group reply review now stops after two rechecks and offers explicit drop, Inbox snooze or one reviewed continuation attempt. An intervening unread message refuses that attempt instead of permitting an obsolete reply; the original target, permissions and decision audit remain intact ([#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)).
- Deferred Inbox work keeps its deadline wake when new Group context arrives without waking the Bot, so an unobserved update cannot silently cancel recovery ([#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)).
- Exhausted review offers a short Host-time snooze suggestion for message contention while preserving Human deadlines and conditions, with guidance to batch completed background work and snooze only unfinished responsibilities; early FYI wakes do not justify polling or moving a Human deadline ([#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)).

- Dropping an exhausted review keeps its original request open instead of carrying unsuccessful-send completion IDs into the drop; completed FYI and observed peer-yield completion remain available. Continuation guidance remains present even when only FYI is completed or no completion IDs are supplied ([#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)).

## zh

- 群聊评估在提前结束前确认已观察和延后的 Inbox 事项已结清，将未完成责任与未知后续成本和答复正确性分别记录（[#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)）。

- 群聊回复最多复核两次，随后明确选择放弃、通过 Inbox 延后，或有依据地申请继续一次；期间出现未读消息会拒绝申请，避免发送过时答案，保留原目标、权限检查和决策记录（[#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)）。
- 未唤醒 Bot 的群聊新消息不再取消 Inbox 延后事项的到期唤醒，避免未读更新使待办无法恢复（[#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)）。
- 预算耗尽时提供基于 Host 时间的短暂延后建议，保留 Human 的时间和条件约束，并引导批量结清已完成的背景事项、仅延后未完成责任；旁话提前唤醒不应触发轮询或移动 Human 的等待时间（[#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)）。
- 因复核耗尽而放弃草稿时，保留原请求的待办状态，避免沿用发送参数误将未完成请求结清；已完成旁话与有依据的同伴让话仍可正常结清。只结清旁话或未提供结清 ID 时，也保留继续处理原请求的指引（[#2055](https://github.com/BotHarness/DeepSeekBot/issues/2055)）。
