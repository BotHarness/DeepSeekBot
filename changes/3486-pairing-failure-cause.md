---
section: Fixed
---

## en

- Mobile pairing now names the real cause when it fails: network faults on Connect or Tailscale no longer read as a fingerprint mismatch, a failed local-network path falls back to the next path, iOS says when Local Network access is turned off, a computer with a new security key and an older Tobs that cannot start pairing get their own messages, every failure shows a short error code with a Copy error details button for reports, and a Local Network denial offers an Open Settings button ([#3486](https://github.com/BotHarness/DeepSeekBot/pull/3486)).

## zh

- 手机配对失败时会说明真实原因：Connect 或 Tailscale 的网络故障不再显示为指纹不匹配，局域网连接失败后会继续尝试下一条路径，iOS 关闭本地网络权限时会直接提示，电脑更换安全密钥或旧版 Tobs 无法开始配对时也有各自的提示，每次失败都会显示简短错误代码并提供「复制错误详情」按钮方便反馈，本地网络权限被拒时还会提供「打开设置」按钮（[#3486](https://github.com/BotHarness/DeepSeekBot/pull/3486)）。
