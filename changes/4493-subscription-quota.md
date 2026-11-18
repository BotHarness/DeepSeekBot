---
section: Added
---

## en

- A Bot running on a Subscription Engine now shows how much of the subscription is left: the Session list chip and Session detail show the share used and the reset time Codex reports, and `deepseekbot engine status` lists the same `quota`. When the subscription runs out, the Bot stops instead of paying per token and posts a card with the reset time and a one-tap **Switch to API model**. If you chose a fallback beforehand (`deepseekbot engine use <bot> codex --role orchestrator --fallback on`), the Bot continues on its own model with a Model Switch Notice and returns to the subscription after the reset ([#4493](https://github.com/BotHarness/DeepSeekBot/issues/4493)).

## zh

- 运行在订阅引擎上的 Bot 现在会显示订阅还剩多少：Session 列表的标签和 Session 详情会显示 Codex 报告的已用比例和重置时间，`deepseekbot engine status` 也会列出同样的 `quota`。订阅额度用完时，Bot 会停下而不是改成按量计费，并发一张带重置时间和"改用 API 模型"一键切换的卡片。如果事先选了备用（`deepseekbot engine use <bot> codex --role orchestrator --fallback on`），Bot 会改用自己的模型继续，记一条 Model Switch Notice，重置后再回到订阅（[#4493](https://github.com/BotHarness/DeepSeekBot/issues/4493)）。
