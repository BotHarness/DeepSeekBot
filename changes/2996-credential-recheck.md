---
section: Fixed
---

## en

- Fixed a Bot refusing every message after a provider credential failure until the Host restarted: the next message re-checks the credential, so a key fixed in a secret store that DSH is not notified about takes effect without a restart ([#2996](https://github.com/BotHarness/DeepSeekBot/issues/2996)).

## zh

- 修复提供商凭证出错后 Bot 在 Host 重启前拒绝每条消息的问题：下一条消息会重新检查凭证，在 DSH 收不到通知的密钥存储里修好密钥后无需重启即可生效（[#2996](https://github.com/BotHarness/DeepSeekBot/issues/2996)）。
