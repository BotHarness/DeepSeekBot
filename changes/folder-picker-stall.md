---
section: Fixed
---

## en

- Choosing a folder to authorize no longer stalls for minutes when the computer has a disconnected network drive or a slow disk. The Host now reads folders in a separate process with a 5 second limit, so a stuck drive shows "This folder is not responding" instead of freezing the whole Host, and drive tabs come from the system's drive list without opening any drive. While a folder is slow, you can still click other drives or folders. Folders you just opened reopen instantly, very large folders load more on request, and on the computer running DSH the desktop opens the system folder dialog directly ([#2934](https://github.com/BotHarness/DeepSeekBot/issues/2934)).

## zh

- 授权文件夹时，即使电脑上有断开的网络盘或很慢的磁盘，目录选择器也不会再卡住几分钟。Host 现在在单独的进程里读取文件夹，限时 5 秒：卡住的磁盘会显示"这个文件夹没有响应"，不会让整个 Host 停住；磁盘标签直接读系统盘符表，不打开任何磁盘。某个文件夹读得慢时，仍可点击其他磁盘或文件夹。刚打开过的文件夹会立即重新显示，文件夹特别多时可以点"显示更多"，在运行 DSH 的电脑上桌面端会直接打开系统文件夹对话框（[#2934](https://github.com/BotHarness/DeepSeekBot/issues/2934)）。
