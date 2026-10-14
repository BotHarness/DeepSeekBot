---
section: Changed
---

## en

- A Bot's request to run a command-line tool with a secret now offers **Always allow this kind** next to Allow once and Reject. It saves a rule for that program, account and set of environment variable names, so later calls with other arguments run without asking; a different program or account still asks. The rule appears with the Bot's other always-allow rules and can be revoked there, and a Lark Approver can make the same choice from the approval card ([#1822](https://github.com/BotHarness/DeepSeekBot/issues/1822)).

## zh

- Bot 请求带着密钥运行命令行工具时，除了“批准一次”和“拒绝”，现在还可以选“总是允许此类”。它为这个程序、账号和这组环境变量名保存一条规则，之后参数不同的调用不再询问；换了程序或账号仍会询问。这条规则和 Bot 的其他“总是允许”规则列在一起，可以在那里撤销；飞书审批人也可以在审批卡片上做同样的选择（[#1822](https://github.com/BotHarness/DeepSeekBot/issues/1822)）。
