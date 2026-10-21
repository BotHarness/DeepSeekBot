---
section: Added
---

## en

- `deepseekbot devices`, `device-offer`, `device-offer-status` and `device-revoke` manage paired phones from the CLI against the same Devices owner as **Bot settings → Devices**. `device-offer` writes the pairing link only to a new private `--out` file and prints a receipt; `device-offer-status` reports `pending`, `redeemed`, `expired`, `refused`, `superseded` or `unknown`; `device-revoke --confirm` signs the device out at once and closes its open streams ([#2098](https://github.com/BotHarness/DeepSeekBot/issues/2098)).

## zh

- `deepseekbot devices`、`device-offer`、`device-offer-status` 和 `device-revoke` 可在 CLI 中管理已配对手机，与 **Bot 设置 → 设备** 使用同一个设备所有者。`device-offer` 只把配对链接写入新建的私有 `--out` 文件，输出中只有回执；`device-offer-status` 报告 `pending`、`redeemed`、`expired`、`refused`、`superseded` 或 `unknown`；`device-revoke --confirm` 立即让该设备退出并关闭它打开的连接（[#2098](https://github.com/BotHarness/DeepSeekBot/issues/2098)）。
