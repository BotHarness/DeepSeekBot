---
section: Added
---

## en

- A PersonaBot's Orchestrator can now run on Codex with your own ChatGPT subscription on this computer. Against an authenticated local Host (`DEEPSEEKBOT_HOST` and its Host token), `deepseekbot engine login codex` starts the Bot's own Codex sign-in; after you finish it in the browser, `deepseekbot engine use <bot> codex --role orchestrator` switches the Bot, and the Bot answers DMs through `bot_send_message`. The Session list and Session detail name the engine and account, and a login that is not a ChatGPT subscription is refused ([#4486](https://github.com/BotHarness/DeepSeekBot/issues/4486)).

## zh

- PersonaBot 的 Orchestrator 现在可以用你在这台电脑上的 ChatGPT 订阅运行在 Codex 上。连到已认证的本地 Host（`DEEPSEEKBOT_HOST` 和 Host token）后，`deepseekbot engine login codex` 会为 Bot 开始单独的 Codex 登录；在浏览器里完成登录后，再用 `deepseekbot engine use <bot> codex --role orchestrator` 切换引擎，Bot 通过 `bot_send_message` 回复私信。Session 列表和详情会显示引擎和账号；不是 ChatGPT 订阅的登录会被拒绝（[#4486](https://github.com/BotHarness/DeepSeekBot/issues/4486)）。
