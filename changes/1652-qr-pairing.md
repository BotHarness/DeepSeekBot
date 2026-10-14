---
section: Added
---

## en

- Added phone pairing: Settings → Devices shows a one-time QR code (and a copyable link) that the DeepSeekBot mobile app scans to pair. A paired phone keeps reaching the Host across restarts through the device gateway, the list shows each phone's pairing and last-seen time, and Revoke cuts a phone off at once, including its open live stream. Settings warn when Tailscale does not publish the Host to the phone ([ADR-0199](../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md), [#1652](https://github.com/BotHarness/DeepSeekBot/issues/1652)).

## zh

- 新增手机配对：「设置 → 设备」显示一次性二维码（也可复制链接），用 DeepSeekBot 手机 App 扫码即可配对。配对后的手机经设备网关访问 Host，Host 重启后无需重新配对；设备列表显示每台手机的配对时间与最近使用时间，「撤销」会立即切断该手机，包括它已打开的实时数据流。若 Tailscale 没有把 Host 发布给手机，设置页会给出提示（[ADR-0199](../docs/adr/0199-paired-devices-reach-the-host-through-a-same-listener-device-gateway.md)，[#1652](https://github.com/BotHarness/DeepSeekBot/issues/1652)）。
