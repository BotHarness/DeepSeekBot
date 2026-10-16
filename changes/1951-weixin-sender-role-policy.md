---
section: Fixed
---

## en

- Sender permission lookups on Weixin and other platforms without a sender Role policy now report `role-policy-not-supported-for-platform` instead of a false `binding-replaced`, so a Bot no longer refuses work over an unchanged binding; real binding changes are still rejected ([#1951](https://github.com/BotHarness/DeepSeekBot/issues/1951)).

## zh

- 在微信等没有发送者角色策略的平台上，发送者权限查询现在返回 `role-policy-not-supported-for-platform`，不再误报 `binding-replaced`，Bot 不会因未变化的绑定而拒绝工作；真实的绑定变更仍会被拒绝（[#1951](https://github.com/BotHarness/DeepSeekBot/issues/1951)）。
