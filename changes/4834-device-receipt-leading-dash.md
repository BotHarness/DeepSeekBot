---
section: Fixed
---

## en

- About one pairing receipt or device id in 64 started with `-`, so `device-offer-status <receipt>` and `device-revoke <device-id>` refused it as an unknown option. The Host no longer issues such ids; existing device ids keep working with `--` before them ([#4834](https://github.com/BotHarness/DeepSeekBot/issues/4834)).

## zh

- 约每 64 个配对回执或设备 id 中就有一个以 `-` 开头，`device-offer-status <receipt>` 和 `device-revoke <device-id>` 会把它当成未知选项而拒绝。Host 不再生成这类 id；已有的此类设备 id 在前面加 `--` 仍可使用（[#4834](https://github.com/BotHarness/DeepSeekBot/issues/4834)）。
