---
section: Fixed
---

## en

- Sender permission lookups on Weixin and other platforms without a sender Role policy now report `role-policy-not-supported-for-platform` instead of a false `binding-replaced`, so a Bot no longer refuses work over an unchanged binding; disabled/replaced identities and revoked Grants are rejected before platform support is checked; connected-group sources retain their ingress Binding, while legacy group sources without that evidence require a fresh message ([#1951](https://github.com/BotHarness/DeepSeekBot/issues/1951)).

## zh

- 在微信等没有发送者角色策略的平台上，发送者权限查询现在返回 `role-policy-not-supported-for-platform`，不再误报 `binding-replaced`，Bot 不会因未变化的绑定而拒绝工作；平台支持判断前先拒绝已禁用／替换身份和已撤销授权；连接群消息保留原始接收绑定，缺少该证据的旧群消息需要发送新消息后再查询（[#1951](https://github.com/BotHarness/DeepSeekBot/issues/1951)）。
