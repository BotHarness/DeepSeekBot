---
section: Fixed
---

## en

- Desktop notifications in the background now follow live attention updates instead of re-reading three Activity lists every 15 seconds, and the phone app checks that a paired Host is reachable with a small ping instead of downloading the whole Bot list every 20 seconds. Hosts without the ping keep working through the old check. The CLI gains `deepseekbot host-ping` ([#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)).

## zh

- 桌面端在后台时，通知改为跟随实时提醒更新，不再每 15 秒重新读取三个活动列表；手机 App 检查已配对的 Host 是否可达时，改用一个很小的 ping，不再每 20 秒下载整份 Bot 列表。不支持 ping 的 Host 会自动沿用原来的检查方式。CLI 新增 `deepseekbot host-ping`（[#3214](https://github.com/BotHarness/DeepSeekBot/issues/3214)）。
