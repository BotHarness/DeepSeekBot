---
section: Added
---

## en

- Bots using a subscription engine can discover and call tools from their granted Connector Accounts. The CLI shows a Bot’s catalog with `connector catalog --bot` and explains its account permissions with `connector grant --explain` ([#5332](https://github.com/BotHarness/DeepSeekBot/issues/5332)).
- When a Bot asks for an app account, its card shows the account, the access and the reason, with Turn on for this Bot, Just this once or No, on the computer and on iOS and Android. If no account fits, the card points to Settings › App connections. A Bot's settings show one-time grants, and the phone has a switch per account ([#5332](https://github.com/BotHarness/DeepSeekBot/issues/5332)).

## zh

- 使用订阅引擎的 Bot 可以查找并调用已获授权的连接器账号工具。CLI 支持用 `connector catalog --bot` 查看 Bot 的目录，也可以用 `connector grant --explain` 查看账号权限及其来源（[#5332](https://github.com/BotHarness/DeepSeekBot/issues/5332)）。
- Bot 请求使用应用账号时，卡片会显示账号、权限和原因，可以选择“为这个 Bot 开启”“仅这一次”或“不用”，电脑和 iOS、Android 上都能处理。没有合适账号时，卡片会引导到设置 › 应用连接。Bot 的设置会显示一次性授权，手机上每个账号都有开关（[#5332](https://github.com/BotHarness/DeepSeekBot/issues/5332)）。
