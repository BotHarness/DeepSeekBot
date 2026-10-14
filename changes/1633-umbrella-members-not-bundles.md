---
section: Fixed
---

## en

- The DSH Plugins page no longer offers Browser, Computer and Core as separate Bundles to turn on. They already run inside DeepSeekBot, and turning one on added a second copy with default settings: Browser lost its headless setting and failed on servers without a display, and Core was declared twice. A Profile that already turned one on keeps working; the extra entry is skipped at startup ([#1633](https://github.com/BotHarness/DeepSeekBot/issues/1633)).

## zh

- DSH 插件页不再把 Browser、Computer 和 Core 列成可以单独开启的 Bundle。它们本来就随 DeepSeekBot 运行，以前开启后会多出一份默认配置的副本：Browser 丢掉 headless 设置，在没有显示器的服务器上启动失败；Core 也被声明了两次。已经开启过的 Profile 不受影响，多出来的条目在启动时会被跳过（[#1633](https://github.com/BotHarness/DeepSeekBot/issues/1633)）。
