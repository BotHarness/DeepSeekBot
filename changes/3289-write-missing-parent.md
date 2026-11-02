---
section: Fixed
---

## en

- Fixed native `write` and `edit` failing with "BotHarness Session file path cannot be resolved" when the target's parent folders do not exist yet; a Bot can now write a new nested file inside its authorized workspace and the missing folders are created ([#3289](https://github.com/BotHarness/DeepSeekBot/issues/3289)).

## zh

- 修复了目标文件的上级文件夹尚不存在时，原生 `write` 和 `edit` 报错“BotHarness Session file path cannot be resolved”的问题；Bot 现在可以在授权工作区内直接写入新的多级路径文件，缺失的文件夹会自动创建（[#3289](https://github.com/BotHarness/DeepSeekBot/issues/3289)）。
