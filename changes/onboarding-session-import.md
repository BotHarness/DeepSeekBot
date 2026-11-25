---
section: Added
---

## en

- The first-run intro now asks which AI tools you have used. Claude Code and Codex sessions on your computer can be picked right there or in "Create Bot from Sessions", and `deepseekbot session-import-list` lists them; the new Bot reads them in place through its Workspace Grants, and `--add-workspaces` adds a session folder that is not a Workspace yet ([#2501](https://github.com/BotHarness/DeepSeekBot/issues/2501), [ADR-0367](docs/decisions/bots.md#adr-0367)).

## zh

- 首次使用的引导会问你用过哪些 AI 工具。电脑上的 Claude Code、Codex 会话可以直接在引导里或「从 Session 创建 Bot」中挑选，也可以用 `deepseekbot session-import-list` 列出；新 Bot 通过工作区授权原地读取它们，`--add-workspaces` 会把还不是工作区的会话文件夹添加为工作区（[#2501](https://github.com/BotHarness/DeepSeekBot/issues/2501)、[ADR-0367](docs/decisions/bots.md#adr-0367)）。
