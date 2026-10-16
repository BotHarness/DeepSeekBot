---
section: Changed
---

## en

- Bot and Assignment prompts now say where new files belong: scratch, logs, bundles and generated results go under `<workspacePath>/.botharness/<short-task-slug>/` inside the Grant unless the Human names a destination (or the system temp directory), never the Grant root, the Human's home directory or a new sibling folder, and existing project files are edited in place. Assignment terminal reports list the files created ([#1957](https://github.com/BotHarness/DeepSeekBot/issues/1957)).

## zh

- Bot 与 Assignment 提示词现在说明新文件应放在哪里：临时文件、日志、打包产物和生成结果除非 Human 指定位置，否则放在 Grant 内的 `<workspacePath>/.botharness/<短任务标识>/`（或系统临时目录），绝不放在 Grant 根目录、Human 主目录或新的同级文件夹；已有项目文件就地修改。Assignment 的终态报告会列出创建的文件（[#1957](https://github.com/BotHarness/DeepSeekBot/issues/1957)）。
