---
section: Added
---

## en

- `client-preferences-get/set`, `client-layout-get/set` and `client-shortcuts-get/set` read one selected Web or Desktop Client's theme and change its locale and alerts (theme stays with `appearance-set`), its global and per-Channel layout, and its navigation shortcuts through the Client's own settings owners. Writes need the revision from a read, refuse a shortcut that another action already uses (naming that action), never ask the browser for notification permission, and wait for the Human's approval card when Tob runs them ([#4831](https://github.com/BotHarness/DeepSeekBot/issues/4831), [#4832](https://github.com/BotHarness/DeepSeekBot/issues/4832), [#4833](https://github.com/BotHarness/DeepSeekBot/issues/4833)).

## zh

- `client-preferences-get/set`、`client-layout-get/set` 和 `client-shortcuts-get/set` 通过 Client 自己的设置来源，读取和修改一个指定 Web 或桌面 Client 的主题、语言和提醒、全局与单个 Channel 的布局，以及导航快捷键。写入需要读取得到的版本号；快捷键已被其他操作占用时会拒绝并说明占用者；不会替用户弹出通知权限请求；由 Tob 执行时要等 Human 在审批卡上批准（[#4831](https://github.com/BotHarness/DeepSeekBot/issues/4831)、[#4832](https://github.com/BotHarness/DeepSeekBot/issues/4832)、[#4833](https://github.com/BotHarness/DeepSeekBot/issues/4833)）。
