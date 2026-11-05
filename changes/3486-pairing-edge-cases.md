---
section: Fixed
---

## en

- Mobile pairing retries the local network once after the iOS Local Network prompt, so allowing access no longer needs a manual retry. A Connect computer that cannot be reached now says whether it has no tunnel, timed out, or returned a server error; computers added from a Tobs account and older Tailscale links also show an error code. iOS builds report the real app version instead of 0.0.1 ([#3486](https://github.com/BotHarness/DeepSeekBot/pull/3486)).

## zh

- 手机配对在 iOS 弹出本地网络权限框后会自动再试一次局域网，允许后不再需要手动重试。Connect 连不上电脑时会区分没有隧道、超时和电脑返回服务器错误；从 Tobs 账号添加电脑和旧版 Tailscale 链接失败时也会显示错误代码。iOS 版本号改为上报真实版本，不再是 0.0.1（[#3486](https://github.com/BotHarness/DeepSeekBot/pull/3486)）。
