---
section: Added
---

## en

- Manage the selected remote environment’s devices, individual routes and account sign-out from its settings, with explicit disconnection or verified route handover and persistent protection against repeating an uncertain write. Replacing the browser grant discards earlier connection confirmations. CLI private stops require `--connection-route-id`; self-disconnecting writes require `--handover` or `--confirm-disconnect` ([#4120](https://github.com/BotHarness/DeepSeekBot/issues/4120)).

## zh

- 在所选远程环境的设置中管理设备、单条路由和账号退出；执行前明确确认断开或验证并切换路由，操作结果未知时持久保留保护，避免重复提交。更换浏览器授权会取消此前的连接操作确认。CLI 停止私有路由须指定 `--connection-route-id`；可能自行断开的写入须指定 `--handover` 或 `--confirm-disconnect`（[#4120](https://github.com/BotHarness/DeepSeekBot/issues/4120)）。
