---
section: Added
---

## en

- Run `deepseekbot doctor` (or `npx -y @botharness/tobs doctor` when the app will not open) for one health report: versions, Host, plugin, last update and the last 24 hours of errors, with a guide for coding agents such as Codex and Claude Code. It reads the local diagnostic log directly when the Host is down, and `diagnostic-logs --offline` does the same. Tob now runs it first when you report a problem ([#3870](https://github.com/BotHarness/DeepSeekBot/pull/3870)).

## zh

- 运行 `deepseekbot doctor`（界面打不开时用 `npx -y @botharness/tobs doctor`）即可得到一份健康报告：版本、Host、插件、最近一次更新和最近 24 小时的错误，并附带给 Codex、Claude Code 等编码 agent 的排查指引。Host 未运行时直接读取本地诊断日志，`diagnostic-logs --offline` 也一样。你报告问题时，托布会先运行它（[#3870](https://github.com/BotHarness/DeepSeekBot/pull/3870)）。
