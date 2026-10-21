import type { MarketplaceLanguage } from '../../../core/src/marketplace/language.js';

export const MARKET_SHARE_PROMPT: Readonly<Record<MarketplaceLanguage, string>> = {
  zh: `请把你的 Memory 仓库分享到 BotHarness 的 Bot 市场，按下面的步骤做，每一步做完告诉我结果：

1. 列出 Memory 里的所有文件，并检查文件内容和 Git 历史里有没有密码、token、私人信息或我不想公开的内容。把发现的问题列给我，等我确认后再继续，确认前不要推送任何东西。
2. 如果还没有 README.md，写一份简短的介绍：你是谁、擅长什么、适合怎么用。然后用另一种语言再写一份：README.md 是中文就写英文的 README.en.md，是英文就写中文的 README.zh-CN.md。
3. 确认 .botharness/bot.json 存在（DeepSeekBot 通常已经自动生成）。没有就创建，写上你的名称、1 到 3 个标签和一句话简介，格式是 {"name": "名称", "tags": ["标签"], "bio": "一句话简介"}；已经有了就保留原有内容。然后在 "i18n" 里加上另一种语言的简介，格式是 {"i18n": {"en": {"bio": "One sentence"}}} 或 {"i18n": {"zh": {"bio": "一句话简介"}}}。
4. 用 gh 在我的 GitHub 账号下创建一个公开仓库并推送当前分支。仓库名用你的名称的英文或拼音，先告诉我你打算用的名字。如果第 1 步发现历史里有不该公开的内容，就只推送一个不带历史的新提交。
5. 给仓库加上 botharness-bot 话题：gh repo edit --add-topic botharness-bot
6. 把仓库地址发给我。`,
  en: `Please share your Memory repository to the BotHarness Bot Marketplace. Follow these steps and tell me the result after each one:

1. List every file in your Memory and check the file contents and Git history for passwords, tokens, personal information or anything I may not want public. List what you find and wait for my confirmation before going on. Do not push anything before I confirm.
2. If there is no README.md, write a short one: who you are, what you are good at, and how to use you. Then write the same introduction in the other language: README.zh-CN.md in Chinese if README.md is in English, or README.en.md in English if it is in Chinese.
3. Check that .botharness/bot.json exists (DeepSeekBot normally creates it). If it is missing, create it with your name, 1 to 3 tags and a one-sentence bio, as {"name": "Name", "tags": ["Tag"], "bio": "One sentence"}; if it exists, keep what is there. Then add the bio in the other language under "i18n", as {"i18n": {"zh": {"bio": "一句话简介"}}} or {"i18n": {"en": {"bio": "One sentence"}}}.
4. Use gh to create a public repository under my GitHub account and push the current branch. Name it after you in English, and tell me the name before creating it. If step 1 found anything in the history that should not be public, push a single new commit without history instead.
5. Add the botharness-bot topic: gh repo edit --add-topic botharness-bot
6. Send me the repository URL.`,
};
