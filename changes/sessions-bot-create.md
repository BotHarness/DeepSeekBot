---
section: Added
---

## en

- Create a Bot from your existing DeepSeek Sessions in the web Client or with `deepseekbot create --from-sessions`. Pick Sessions by Workspace, by hand or the latest N; the new Bot is granted the Workspaces they worked in and reads the Sessions itself to set up its role and Memory, without copying them ([ADR-0366](docs/decisions/bots.md#adr-0366)).

## zh

- 可以在网页端或用 `deepseekbot create --from-sessions` 从已有的 DeepSeek Session 创建 Bot。按工作区、手动或按最近 N 个挑选 Session；新 Bot 会获得这些 Session 所在工作区的授权，并自己读取它们来确定角色和记忆，不复制对话（[ADR-0366](docs/decisions/bots.md#adr-0366)）。
