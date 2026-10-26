---
section: Fixed
---

## en

- Fixed complete environment backups being blocked by an exact DSH release check. New backups record actual runtime provenance, historical v1 backups remain readable, and Settings distinguishes upgrade requirements from damaged files, groups export/import actions and reveals detailed recovery guidance on demand. Upgrade Tobs before reading new v2 archives with an older installation ([#2790](https://github.com/BotHarness/DeepSeekBot/issues/2790), [#2794](https://github.com/BotHarness/DeepSeekBot/issues/2794)).

## zh

- 修复完整环境备份被 DSH 精确版本检查阻断的问题。新备份记录真实运行时来源，继续支持读取历史 v1 备份，设置页区分需要升级与文件损坏，按导出和导入组织操作，详细恢复说明按需展开。旧安装读取新 v2 备份前需先升级 Tobs（[#2790](https://github.com/BotHarness/DeepSeekBot/issues/2790)，[#2794](https://github.com/BotHarness/DeepSeekBot/issues/2794)）。
