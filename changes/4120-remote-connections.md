---
section: Added
---

## en

- Bind private-route stop confirmations to the inspected configuration so a concurrent replacement is preserved; require the same revision in CLI execution and unknown-result readback ([#4120](https://github.com/BotHarness/DeepSeekBot/issues/4120)).

- Preserve connection-change protection when storage fails or browser authorization changes, reject unrecognized write acknowledgements, and keep trusted route addresses intact during handover. Clarify reauthorization after revocation and reading back old-grant results. While new-format records remain, reload older pages before managing connections ([#4120](https://github.com/BotHarness/DeepSeekBot/issues/4120)).

- Manage the selected remote environment’s devices, individual routes and account sign-out from its settings, with explicit disconnection or verified route handover and persistent protection against repeating an uncertain write. Replacing the browser grant discards earlier connection confirmations. CLI private stops require `--connection-route-id`; self-disconnecting writes require `--handover` or `--confirm-disconnect` ([#4120](https://github.com/BotHarness/DeepSeekBot/issues/4120)).

## zh

- 将私有线路停止确认绑定到所检查的配置，避免停止并发替换后的新线路；CLI 执行与未知结果回读均核对同一配置代次（[#4120](https://github.com/BotHarness/DeepSeekBot/issues/4120)）。

- 保存失败或浏览器授权变化时保留连接更改保护，未识别的写入响应不视为成功；切换时保留已信任路由的原地址，并说明撤销后的重新授权及旧授权结果回读。存在新格式记录时，旧页面需重新加载后再管理连接（[#4120](https://github.com/BotHarness/DeepSeekBot/issues/4120)）。

- 在所选远程环境的设置中管理设备、单条路由和账号退出；执行前明确确认断开或验证并切换路由，操作结果未知时持久保留保护，避免重复提交。更换浏览器授权会取消此前的连接操作确认。CLI 停止私有路由须指定 `--connection-route-id`；可能自行断开的写入须指定 `--handover` 或 `--confirm-disconnect`（[#4120](https://github.com/BotHarness/DeepSeekBot/issues/4120)）。
