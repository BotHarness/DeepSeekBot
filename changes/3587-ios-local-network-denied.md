---
section: Fixed
---

## en

- On iPhone, when local-network pairing fails before the computer answers, the app now asks iOS whether Local Network access is blocked. A blocked permission shows the Local Network message and the Open Settings button, instead of the generic "can't reach your computer" error ([#3587](https://github.com/BotHarness/DeepSeekBot/pull/3587)).
- On iPhone, connecting to your computer over the local network no longer fails right after the connection opens. Pairing showed "can't reach your computer", and already paired computers failed to load chats, even with Local Network access turned on ([#3587](https://github.com/BotHarness/DeepSeekBot/pull/3587)).

## zh

- iPhone 上局域网配对在电脑响应前失败时，App 会向 iOS 确认本地网络权限是否被关闭。如果被关闭，会显示本地网络的提示和「打开设置」按钮，不再只显示笼统的「连不上你的电脑」（[#3587](https://github.com/BotHarness/DeepSeekBot/pull/3587)）。
- iPhone 上通过局域网连接电脑时，不会再在连接刚建立就失败。之前即使已开启本地网络权限，配对也会显示「连不上你的电脑」，已配对的电脑也会加载不出聊天（[#3587](https://github.com/BotHarness/DeepSeekBot/pull/3587)）。
