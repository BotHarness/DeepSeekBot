---
section: Changed
---

## en

- The Bot Browser panel in the Host web page now follows the page as it changes instead of refreshing once per second. Chrome pushes a new picture whenever the page repaints, so typing, scrolling and clicking show up in about a quarter of a second, and a page that does not change costs nothing. Runtimes that cannot stream keep the once-per-second picture ([#1636](https://github.com/BotHarness/DeepSeekBot/issues/1636)).

## zh

- Host 网页里的 Bot 浏览器面板现在随页面变化实时刷新，不再每秒刷新一次。页面每次重绘时 Chrome 都会推送新画面，所以输入、滚动和点击大约四分之一秒就能看到，页面不变时不产生额外开销。无法推流的运行方式仍保持每秒一张画面（[#1636](https://github.com/BotHarness/DeepSeekBot/issues/1636)）。
