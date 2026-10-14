---
section: Fixed
---

## en

- Entering `deepseekbot` on the DSH Plugins page installs it in one step again; 1.3.0 first stopped to ask for `agent-browser` build approval. The Browser trial driver's `agent-browser` is now an optional add-on. DeepSeekBot now declares that it needs DSH 0.2.0-rc.2, the only release its bundled Computer runtime works with, so other DSH versions get a clear refusal naming DeepSeekBot. Every release is now installed into a fresh Profile before it is published ([#1672](https://github.com/BotHarness/DeepSeekBot/pull/1672)).

## zh

- 在 DSH 插件页输入 `deepseekbot` 重新一步装好；1.3.0 会先停下来要求批准 `agent-browser` 构建。Browser 试用驱动用的 `agent-browser` 改为可选加装。DeepSeekBot 现在明确声明需要 DSH 0.2.0-rc.2（随包的 Computer 运行时只兼容这个版本），其他 DSH 版本会直接看到点名 DeepSeekBot 的不兼容提示。每次发版前都会先在全新 Profile 里实装验证（[#1672](https://github.com/BotHarness/DeepSeekBot/pull/1672)）。
