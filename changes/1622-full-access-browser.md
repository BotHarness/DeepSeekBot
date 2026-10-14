---
section: Fixed
---

## en

- Fixed a PersonaBot with dangerous full access being unable to use its Bot Browser or the Computer. Full access turns approval cards off, and these two tools still waited for one, so every call was refused. A Session that has full access now gets that authorization without a card, and running a program with your secrets (`secret_cli`, `secret_mcp_connect`) no longer asks on every call either. Full access now means no approval cards; the Bot can still ask you a question or for a secret. Bots in the default mode still see the approval cards ([#1622](https://github.com/BotHarness/DeepSeekBot/issues/1622)).

## zh

- 修复了开启危险完全访问的 PersonaBot 无法使用 Bot 浏览器和 Computer 的问题。完全访问会关闭审批卡片，而这两个工具仍在等待审批，所以每次调用都被拒绝。现在拥有完全访问的会话会直接获得这项授权，不再弹卡片；用你的密钥运行程序（`secret_cli`、`secret_mcp_connect`）也不再每次询问。完全访问即不弹任何审批卡片，Bot 仍可以向你提问或请你输入密钥。默认模式的 Bot 仍然会看到审批卡片（[#1622](https://github.com/BotHarness/DeepSeekBot/issues/1622)）。
