---
section: Fixed
---

## en

- A new Tob's own files folder starts writable, so its Assignments can save files with the native write tool (a Tob created earlier asks for write access once), and a folder whose **Allow Bot to write** is off now refuses Assignment writes consistently: native file tools say the folder is read-only and point the Bot to the folder request instead of saying it is outside the workspace, and the Assignment Shell runs read-only too ([#4580](https://github.com/BotHarness/DeepSeekBot/issues/4580)).

## zh

- 新建的 Tob 自己的 files 文件夹默认可写，其 Assignment 可以用原生 write 保存文件（之前创建的 Tob 会先申请一次写入权限）；关闭了「允许 Bot 写入此文件夹」的目录对 Assignment 的写入保持一致：原生文件工具提示该目录只读并引导 Bot 发起授权申请，而不是提示位于授权工作区之外，Assignment 的 Shell 也以只读方式运行（[#4580](https://github.com/BotHarness/DeepSeekBot/issues/4580)）。
