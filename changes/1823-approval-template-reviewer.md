---
section: Added
---

## en

- A PersonaBot can now select an Approval Template, "Cautious" or "Get the work done", in its workspace settings or with `deepseekbot approval-template-set`. While one is selected, an Approval Reviewer answers the Bot's operation approvals (Shell commands that leave the sandbox, file tools, opening an attachment) by the template before any card is posted: it allows or rejects a call and leaves a folded record in the Channel, or sends the call on to you as the usual card when it is unsure or fails. Secret tools, Browser and Computer authorization, and changes to a Bot's template always need your own approval ([#1823](https://github.com/BotHarness/DeepSeekBot/issues/1823)).

## zh

- PersonaBot 现在可以在工作区设置里或用 `deepseekbot approval-template-set` 选择一个自动审批模板（“谨慎”或“把活干完”）。选中后，审批员会先按模板回答此 Bot 的操作审批（越出沙箱的 Shell 命令、文件工具、打开附件），再决定是否发卡片：它批准或拒绝的调用会在 Channel 里留下一条折叠记录；它拿不准或出错时，仍按原来的卡片交给你。密钥工具、浏览器和电脑授权，以及修改 Bot 的模板，永远需要你本人批准（[#1823](https://github.com/BotHarness/DeepSeekBot/issues/1823)）。
