---
section: Fixed
---

## en

- A Bot shared to the Marketplace keeps the avatar its owner set: drawn Avatars too large for `bot.json` now travel as an image plus their recipe, Marketplace cards show the shared avatar instead of one generated from the name, importing restores it, and one invalid field in `bot.json` (such as an over-long translated bio) no longer discards its name, avatar and banner ([#3056](https://github.com/BotHarness/DeepSeekBot/pull/3056)).

## zh

- 分享到 Bot 市场的 Bot 会保留主人设置的头像：画了自定义部件、超出 `bot.json` 上限的头像改为以图片加配方的形式携带，市场卡片显示分享的头像而不是按名字生成的头像，导入后也会还原该头像；`bot.json` 中单个字段不合法（如翻译简介过长）时不再连带丢掉名称、头像和 banner（[#3056](https://github.com/BotHarness/DeepSeekBot/pull/3056)）。
