---
section: Fixed
---

## en

- Fixed repeated Android push registrations triggered by reading the device token. Token updates now reuse the supplied token, and an older registration cannot overwrite a newer token ([#3223](https://github.com/BotHarness/DeepSeekBot/issues/3223)).

## zh

- 修复 Android 读取设备推送 token 后反复触发通知注册的问题。token 更新时直接使用事件提供的 token，并防止旧注册覆盖新 token（[#3223](https://github.com/BotHarness/DeepSeekBot/issues/3223)）。
