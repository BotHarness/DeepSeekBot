---
section: Fixed
---

## en

- The iOS app no longer re-registers for push and re-sends notification preferences to every paired Host about every 2 seconds. Fetching the push token reported the same token as a change, which started the next registration; the app now re-registers only when the token really changes, saving battery and Host load ([#3524](https://github.com/BotHarness/DeepSeekBot/issues/3524)).

## zh

- 修复了 iOS App 大约每 2 秒就向每台已配对 Host 重新注册推送、重发通知偏好的问题。原因是获取推送 token 时，系统把同一个 token 当作“已变化”上报，从而触发下一轮注册。现在只有 token 真正变化时才会重新注册，省电，也减轻 Host 负担（[#3524](https://github.com/BotHarness/DeepSeekBot/issues/3524)）。
