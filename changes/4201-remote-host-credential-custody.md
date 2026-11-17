---
section: Security
---

## en

- Remote Host credentials, device keys and private relay tokens move from browser storage into the local Host's credentials service; the browser keeps only opaque handles that work through Owner-only Host routes, existing pairings move once on start (a pairing the Host cannot take yet stays in the browser and is retried on the next start), and Member or Admin pages can neither read nor use them ([#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)).

## zh

- 远程 Host 的凭据、设备密钥和私有中继 token 从浏览器存储移入本机 Host 的凭据服务；浏览器只保留不透明句柄，只能经仅 Owner 可用的 Host 路由使用，已有配对在启动时一次性迁移（Host 暂时接收不了的配对会留在浏览器，下次启动再试），成员或 Admin 页面既读不到也用不了（[#4201](https://github.com/BotHarness/DeepSeekBot/issues/4201)）。
