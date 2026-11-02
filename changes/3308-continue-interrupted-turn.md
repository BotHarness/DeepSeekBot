---
section: Added
---

## en

- A failed Bot reply in a Bot DM now offers **Continue** on desktop, mobile and `deepseekbot channel-retry --recovery continue`: the Bot picks the turn up in the same Session with the steps it already completed, even after it sent progress messages or started Assignments, instead of starting over. The card shows how many steps finished, where the turn stopped and which calls have an unknown outcome. Network, timeout, server, rate-limit and empty-response failures continue by themselves after 60 seconds and then 180 seconds, with a countdown you can cancel, and turns interrupted by a Host restart continue on start-up instead of replaying the request ([#3308](https://github.com/BotHarness/DeepSeekBot/issues/3308)).

## zh

- Bot 私聊里回复失败时，桌面端、移动端和 `deepseekbot channel-retry --recovery continue` 现在提供「继续」：Bot 在同一个 Session 里带着已完成的步骤接着做，即使这一轮已经发过进度消息或建过 Assignment，也不再从头重来。失败卡片会显示完成了几步、停在哪个工具，以及哪些调用结果未知。网络、超时、服务端、限流和空响应类失败会在 60 秒后、再失败则 180 秒后自动继续，倒计时期间可以取消；被 Host 重启打断的回合在启动时直接继续，不再重放原请求（[#3308](https://github.com/BotHarness/DeepSeekBot/issues/3308)）。
