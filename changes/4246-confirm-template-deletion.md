---
section: Changed
---

## en

- Approval Template deletion now previews affected Bots and the resulting global choice, requires explicit confirmation, and moves specific users to global inheritance; deleting the global default clears it while preserving saved authorizations and private Bot identities ([#4246](https://github.com/BotHarness/DeepSeekBot/issues/4246)).

- Oversized or unreadable custom files remain removable through a fresh explicit deletion preview; unreadable-content recovery uses bounded filesystem identity and leaves Reviewer read limits unchanged ([#4246](https://github.com/BotHarness/DeepSeekBot/issues/4246)).

## zh

- 审批模板删除前显示受影响 Bot 和删除后的全局选择，显式确认后将特定引用统一改为继承全局；删除全局默认会清空默认，并保留已保存授权及私有 Bot 身份边界（[#4246](https://github.com/BotHarness/DeepSeekBot/issues/4246)）。

- 自定义模板文件超限或内容不可读时，仍可重新预览并显式确认删除；恢复删除使用有界文件系统身份，Reviewer 正文读取上限不变（[#4246](https://github.com/BotHarness/DeepSeekBot/issues/4246)）。
