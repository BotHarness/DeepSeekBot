---
section: Fixed
---

## en

- Fixed channel-group creation, renaming and deletion to wait for the Host, preserve failed edits for retry and avoid duplicate submissions; a failed move after creation keeps the new group ([#3570](https://github.com/BotHarness/DeepSeekBot/issues/3570)).

## zh

- 修复频道分组创建、重命名和删除：等待 Host 确认，失败保留输入供重试，防止重复提交；创建后的移动失败会保留新分组（[#3570](https://github.com/BotHarness/DeepSeekBot/issues/3570)）。
