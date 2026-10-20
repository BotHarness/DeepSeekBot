---
section: Added
---

## en

- The Bot Marketplace now shows listings in your interface language when the repository has it: `README.zh-CN.md` or `README.en.md` next to `README.md`, and a translated name and bio under `i18n` in `.botharness/bot.json`. When a Bot has no bio in your language, the Marketplace can show a one-sentence AI summary of its README, labelled "AI summary"; until one is generated, the author's own bio is shown. `deepseekbot marketplace-list` and `marketplace-detail` take `--lang zh|en`. The Share a Bot guide describes the convention ([#2375](https://github.com/BotHarness/DeepSeekBot/pull/2375)).

## zh

- Bot 市场现在按界面语言显示 Bot，前提是仓库里有对应内容：`README.md` 旁边的 `README.zh-CN.md` 或 `README.en.md`，以及 `.botharness/bot.json` 里 `i18n` 下翻译好的名称和简介。Bot 没有你所用语言的简介时，市场可以显示 AI 根据 README 写的一句简介，并标注“AI 摘要”；还没生成时显示作者原本的简介。`deepseekbot marketplace-list` 和 `marketplace-detail` 支持 `--lang zh|en`。《分享 Bot》指南写明了这套约定（[#2375](https://github.com/BotHarness/DeepSeekBot/pull/2375)）。
