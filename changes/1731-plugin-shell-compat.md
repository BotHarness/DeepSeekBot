---
section: Fixed
---

## en

- On Windows, a Bot's Orchestrator now runs its Shell as `pwsh`, the Shell its preset provides, instead of a `bash` tool that ran through PowerShell; `pwsh` commands in a writable Workspace Grant use that Grant. Bot role prompts no longer name `bash` as the only Shell, so a Bot also uses a Shell that another installed plugin adds, such as `ops_bash` ([#1731](https://github.com/BotHarness/DeepSeekBot/issues/1731)).

## zh

- 在 Windows 上，Bot 的 Orchestrator 现在使用其预设提供的 `pwsh` 作为 Shell，不再出现实际经由 PowerShell 运行的 `bash` 工具；在可写的 Workspace Grant 中运行的 `pwsh` 命令会使用该 Grant。Bot 的角色提示词不再把 `bash` 说成唯一的 Shell，因此 Bot 也会使用其他已安装插件添加的 Shell，例如 `ops_bash`（[#1731](https://github.com/BotHarness/DeepSeekBot/issues/1731)）。
