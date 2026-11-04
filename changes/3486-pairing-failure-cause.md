---
section: Fixed
---

## en

- Mobile pairing now names the real cause when it fails: network faults on Connect or Tailscale no longer read as a fingerprint mismatch, a failed local-network path falls back to the next path, iOS says when Local Network access is turned off, a computer with a new security key and an older Tobs that cannot start pairing get their own messages, and every failure shows a short error code to copy into a report ([#3486](https://github.com/BotHarness/DeepSeekBot/pull/3486)).

## zh

- 手机配对失败时会说明真实原因：Connect 或 Tailscale 的网络故障不再显示为指纹不匹配，局域网连接失败后会继续尝试下一条路径，iOS 关闭本地网络权限时会直接提示，电脑更换安全密钥或旧版 Tobs 无法开始配对时也有各自的提示，并且每次失败都会显示可复制反馈的简短错误代码（[#3486](https://github.com/BotHarness/DeepSeekBot/pull/3486)）。
