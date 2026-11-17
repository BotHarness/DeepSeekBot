---
section: Fixed
---

## en

- Signing in to a Team Host with a username from the desktop or Web Client now works for HTTPS and Tailscale addresses. The Client asks its own Host to send the sign-in and the first password change, because the Team Host refuses requests that carry a browser Origin. Team settings now also say that a public Bot's memory and Skills are shared by every member ([#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)).

## zh

- 在桌面端或 Web 端用用户名登录 Team Host 时，HTTPS 和 Tailscale 地址现在可以登录了。Team Host 会拒绝带浏览器 Origin 的请求，所以登录和首次改密码改由本机 Host 代发。Team 设置里也写明了：公共 Bot 的记忆和 Skill 由所有成员共享（[#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)）。
