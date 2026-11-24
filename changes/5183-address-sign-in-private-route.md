---
section: Added
---

## en

- A Host Owner can turn on **Allow sign-in by address** for the custom private route (Named Tunnel or HTTPS ingress), so Host Members sign in by typing its address with a username and password on phone, Desktop or Web. The setting is off by default, the Quick Tunnel and Docker private relay stay token-only, and turning it off closes the route again. The address becomes discoverable on the public internet and anyone can try a password. The route has its own sign-in rate limit, caps connections that have not signed in yet (signed-in devices never count) and closes them quickly, so it can't block Connect, other tunnels, the relay or SSH. It needs Team mode or Owner password sign-in, and it is unavailable on an HTTPS ingress that also listens on the local network. CLI: `deepseekbot private-route allow-address-sign-in custom --confirm` and `deny-address-sign-in` ([#5183](https://github.com/BotHarness/DeepSeekBot/issues/5183)).

## zh

- Host Owner 可以为自定义私有连接（Named Tunnel 或 HTTPS 入口）打开“允许凭地址登录”，Host Member 在手机、桌面或网页上输入地址、用户名和密码即可登录。此设置默认关闭，Quick Tunnel 和 Docker 私有中继仍只凭令牌准入，关闭后连接恢复私有。地址会在公网上可被发现，任何人都可以尝试密码。这条连接有独立的登录限流，并限制、尽快关闭尚未登录的连接（已登录的设备不计入），因此不会挡住 Connect、其他隧道、中继或 SSH。需要先开启团队模式或 Owner 密码登录；同时在局域网监听的 HTTPS 入口不能开启。CLI：`deepseekbot private-route allow-address-sign-in custom --confirm` 和 `deny-address-sign-in`（[#5183](https://github.com/BotHarness/DeepSeekBot/issues/5183)）。
