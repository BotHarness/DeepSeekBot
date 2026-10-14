---
section: Fixed
---

## en

- When the Bot Browser cannot start because the OS blocks Chrome's sandbox, the panel no longer tells you to enable headless, which was already on and could not help. On Linux it now names the likely cause, AppArmor restricting user namespaces on Ubuntu 23.10 and later, and Details includes an AppArmor profile for the Bot Browser's own Chrome that allows them ([#1635](https://github.com/BotHarness/DeepSeekBot/pull/1635)).

## zh

- Bot 浏览器因系统拦截 Chrome 沙箱而无法启动时，面板不再让你去打开 headless：它本来就是开着的，打开也没用。在 Linux 上，面板现在会说明常见原因：Ubuntu 23.10 起 AppArmor 限制了用户命名空间。“详情”里附有一份 AppArmor 配置，只为 Bot 浏览器自带的 Chrome 放开这项限制（[#1635](https://github.com/BotHarness/DeepSeekBot/pull/1635)）。
